"""
DIAGNÓSTICO (estágio 0 da prova de conceito MERGE/CPTEC-INPE): consegue ler um
arquivo GRIB2 real do MERGE e reconhecer a variável de precipitação?
================================================================================
CONTEXTO: decisão do usuário (07/07/2026) de investir em cobertura nacional
para o teste de clima x ressarcimento por danos elétricos (ver ARQUITETURA.md,
seção "PESQUISA DE VIABILIDADE - cobertura nacional (MERGE/ERA5)"), escolhendo
seguir com precipitação (MERGE) E vento (ERA5-Land) em paralelo ("Os dois").

Este script NÃO é a prova de conceito completa (essa ainda depende deste
resultado) — é um passo anterior, deliberadamente pequeno: baixar 1 (UM)
arquivo `.grib2` do MERGE e apenas inspecionar a estrutura que `cfgrib`
consegue extrair dele, antes de escrever qualquer lógica de agregação mensal
ou comparação com INMET.

POR QUE ESTE PASSO EXISTE SEPARADO (não foi direto para a prova de conceito
completa): o MERGE usa variáveis definidas pelo próprio CPTEC (`PREC`, `NEST`)
em vez do catálogo de parâmetros GRIB padrão da OMM. Bibliotecas como
`cfgrib`/`eccodes` foram construídas em torno do catálogo padrão — não há
confirmação de que elas reconheçam essas variáveis customizadas do jeito
esperado (podem aparecer com nome genérico tipo `unknown`, podem gerar múltiplos
"hypercubes" separados que o `xarray.open_dataset` sozinho não consegue
combinar, ou pode ser necessário `filter_by_keys`). Testar isso ANTES de
escrever 150 linhas de lógica de agregação evita destrinchar um bug de
biblioteca no meio de uma lógica mais complexa — mesmo princípio já aplicado
nesta sessão com o bug de delimitador do CSV do INDGER (investigar primeiro
contra o dado real, não confiar na documentação).

CONFIRMADO NESTA SESSÃO (ambiente de teste, não o ambiente do usuário): `pip
install cfgrib xarray eccodes` instala sem conda e sem biblioteca de sistema
separada. O que ainda NÃO foi testado é a leitura de um arquivo MERGE real —
é exatamente o que este script faz.

O QUE ESTE SCRIPT FAZ:
  1. Baixa 1 único arquivo `.grib2` do MERGE (um dia de teste, ver
     DATA_TESTE abaixo) do FTP público do CPTEC.
  2. Tenta abrir com `cfgrib` via `xarray.open_dataset`. Se falhar com erro de
     múltiplos "hypercubes" (comum em GRIB2 com variáveis não padronizadas),
     tenta de novo com `cfgrib.open_datasets` (plural — retorna uma LISTA de
     datasets em vez de forçar um só).
  3. Imprime a estrutura completa de cada dataset encontrado: nomes de
     variáveis, dimensões, shape, atributos (`long_name`, `units`,
     `GRIB_shortName`, `GRIB_paramId` se existirem) — para identificar
     manualmente qual variável corresponde a PREC (precipitação) e qual a
     NEST (contagem de estações).
  4. Imprime um recorte pequeno dos valores (canto superior-esquerdo da
     grade) só para confirmar que os números fazem sentido como mm de chuva
     (não NaN generalizado, não todos zero, não um código de erro).

O QUE ESTE SCRIPT **NÃO** FAZ (fica para a próxima etapa, depois de ver este
resultado): não faz agregação mensal, não busca a grade mais próxima de
município nenhum, não compara com INMET. Esse é o próximo passo, só depois
de confirmar aqui que a leitura básica funciona e qual é o nome real da
variável de precipitação dentro do arquivo.

ESTE SCRIPT É SOMENTE LEITURA E NÃO GRAVA NADA NO BANCO — nem chega a abrir
conexão com o Postgres.
================================================================================
"""

import os
import sys

import requests

# Dia de teste: 15/01/2024 (meio do mês, meio do verão — período de maior
# chance de chuva forte para um teste de sanidade visual dos valores).
ANO_TESTE = 2024
MES_TESTE = 1
DIA_TESTE = 15

URL_BASE_MERGE = "https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/DAILY"
NOME_ARQUIVO = f"MERGE_CPTEC_{ANO_TESTE}{MES_TESTE:02d}{DIA_TESTE:02d}.grib2"
URL_ARQUIVO = f"{URL_BASE_MERGE}/{ANO_TESTE}/{MES_TESTE:02d}/{NOME_ARQUIVO}"

CAMINHO_CACHE = os.environ.get(
    "CAMINHO_CACHE_MERGE_TESTE",
    f"backend/src/etl/data/raw/inpe_merge_teste/{NOME_ARQUIVO}",
)


def baixar_arquivo_teste() -> str:
    print(f"[1/3] Baixando 1 arquivo de teste do MERGE ({NOME_ARQUIVO})...")
    os.makedirs(os.path.dirname(CAMINHO_CACHE), exist_ok=True)

    if os.path.exists(CAMINHO_CACHE):
        print(f"      Já em cache local ({CAMINHO_CACHE}) — pulando download.")
        return CAMINHO_CACHE

    resposta = requests.get(URL_ARQUIVO, timeout=60)
    if resposta.status_code != 200:
        raise SystemExit(
            f"[ERRO] Download falhou (HTTP {resposta.status_code}) para "
            f"{URL_ARQUIVO}. Verifique se a URL/estrutura de pastas do FTP "
            f"mudou, ou tente outra data em DATA_TESTE."
        )

    with open(CAMINHO_CACHE, "wb") as f:
        f.write(resposta.content)

    tamanho_kb = len(resposta.content) / 1024
    print(f"      OK — {tamanho_kb:.0f} KB salvos em {CAMINHO_CACHE}")
    return CAMINHO_CACHE


def inspecionar_estrutura(caminho: str) -> None:
    print("\n[2/3] Tentando abrir com cfgrib/xarray (modo padrão, 1 dataset único)...")

    import cfgrib  # noqa: F401 (só para confirmar que o import funciona antes de tentar abrir)
    import xarray as xr

    datasets = []
    erro_modo_padrao = None

    try:
        ds = xr.open_dataset(caminho, engine="cfgrib")
        datasets = [ds]
        print("      OK — abriu como um único dataset no modo padrão.")
    except Exception as exc:  # noqa: BLE001 - diagnóstico exploratório, queremos ver qualquer erro
        erro_modo_padrao = exc
        print(f"      [AVISO] Modo padrão falhou: {type(exc).__name__}: {exc}")
        print("      Tentando cfgrib.open_datasets (retorna lista, aceita "
              "variáveis com grades/parâmetros incompatíveis entre si)...")
        try:
            datasets = cfgrib.open_datasets(caminho)
            print(f"      OK — abriu como {len(datasets)} dataset(s) separado(s).")
        except Exception as exc2:  # noqa: BLE001
            raise SystemExit(
                f"[ERRO] Também falhou com cfgrib.open_datasets: "
                f"{type(exc2).__name__}: {exc2}\n\n"
                f"Erro original do modo padrão, para contexto: {erro_modo_padrao}\n\n"
                f"Isso indica que o arquivo GRIB2 do MERGE precisa de um "
                f"parâmetro extra (ex.: filter_by_keys) que ainda não "
                f"identificamos. Reportar esta saída completa de volta para "
                f"decidir o próximo ajuste."
            ) from exc2

    print(f"\n[3/3] Estrutura de {len(datasets)} dataset(s) encontrado(s):")
    for i, ds in enumerate(datasets):
        print(f"\n  --- Dataset {i} ---")
        print(f"  Variáveis: {list(ds.data_vars)}")
        print(f"  Dimensões: {dict(ds.sizes)}")
        print(f"  Coordenadas: {list(ds.coords)}")

        for nome_var, var in ds.data_vars.items():
            atributos_relevantes = {
                chave: var.attrs.get(chave)
                for chave in ("long_name", "units", "GRIB_shortName", "GRIB_paramId", "GRIB_name")
                if chave in var.attrs
            }
            print(f"\n    Variável '{nome_var}':")
            print(f"      shape={var.shape}, dtype={var.dtype}")
            print(f"      atributos: {atributos_relevantes}")

            try:
                recorte = var.values[:5, :5] if var.ndim == 2 else var.values.flatten()[:10]
                print(f"      amostra de valores (canto/início da grade):\n{recorte}")
            except Exception as exc:  # noqa: BLE001
                print(f"      [AVISO] não consegui extrair amostra de valores: {exc}")


def main():
    print("Diagnóstico de leitura GRIB2 — MERGE/CPTEC-INPE (estágio 0 da POC)")
    print("=" * 78)

    caminho = baixar_arquivo_teste()
    inspecionar_estrutura(caminho)

    print("\n✅ Diagnóstico concluído (somente leitura, nenhuma escrita no banco).")
    print("   Próximo passo: usar os nomes de variável/atributos vistos acima para")
    print("   escrever a prova de conceito completa (agregação mensal + comparação")
    print("   com INMET) sem precisar adivinhar a estrutura do arquivo.")


if __name__ == "__main__":
    main()
