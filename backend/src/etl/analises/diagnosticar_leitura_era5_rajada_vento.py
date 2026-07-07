"""
DIAGNÓSTICO (estágio 0 da prova de conceito ERA5/vento): a conta CDS está
funcionando e consigo baixar + ler rajada de vento (fg10) para o Brasil?
================================================================================
CONTEXTO: decisão do usuário (07/07/2026) de investir em cobertura nacional
para o teste de clima x ressarcimento por danos elétricos, escolhendo seguir
com precipitação (MERGE) E vento (ERA5) em paralelo ("Os dois"). Ver
ARQUITETURA.md, seção "PESQUISA DE VIABILIDADE - cobertura nacional
(MERGE/ERA5)".

CORREÇÃO IMPORTANTE (08/07/2026), feita ANTES de escrever este script: a nota
de viabilidade original dizia que a rajada de vento (`fg10`) estaria
disponível no **ERA5-Land** (~9 km). Isso estava ERRADO — verificado direto
na documentação do Copernicus CDS antes de codar qualquer coisa (mesmo
princípio já seguido o resto desta sessão: nunca confiar em nota anterior sem
checar contra a fonte real). O que se confirmou:
  - ERA5-Land (`reanalysis-era5-land`, ~9 km) tem só vento SUSTENTADO
    (componentes u/v a 10m) — SEM rajada.
  - Rajada instantânea (`fg10`) só existe no ERA5 "completo"
    (`reanalysis-era5-single-levels`), que tem resolução MAIS GROSSEIRA:
    **0,25° (~28 km)**, não 9 km.
Ou seja, a limitação de sub-escala de grade (rajada localizada que a
reanálise tende a subestimar, mesmo ponto já registrado no ARQUITETURA.md
para a comparação com INMET) fica AINDA mais severa do que o previsto — o
dataset correto é `reanalysis-era5-single-levels`, não `reanalysis-era5-land`.

O QUE ESTE SCRIPT FAZ:
  1. Faz UM pedido pequeno ao CDS API: 1 único dia (ver DATA_TESTE), poucas
     horas, variável `10m_wind_gust_since_previous_post_processing`, recorte
     geográfico pequeno cobrindo só a área de teste (não o Brasil inteiro —
     um pedido pequeno é mais rápido de processar na fila do CDS e já valida
     o pipeline).
  2. Salva o GRIB retornado e abre com `cfgrib`/`xarray` (mesma biblioteca já
     confirmada nesta sessão para o MERGE).
  3. Imprime a estrutura (variáveis, dimensões, atributos) e uma amostra de
     valores — para confirmar visualmente que os números fazem sentido como
     m/s de rajada (não NaN generalizado, não zero generalizado).

O QUE ESTE SCRIPT **NÃO** FAZ (fica para depois de ver este resultado): não
faz agregação mensal, não busca o ponto de grade mais próximo de município
nenhum, não compara com INMET. Mesma lógica de estágio 0 já usada em
diagnosticar_leitura_merge_grib2.py.

PRÉ-REQUISITO (feito pelo usuário, não por este script): conta criada no
Copernicus CDS, chave pessoal salva em `~/.cdsapirc` no formato:
    url: https://cds.climate.copernicus.eu/api
    key: <TOKEN>
e Termos de Uso do dataset ERA5 aceitos manualmente na página do dataset
(https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels) —
sem isso, a API retorna erro de permissão. Este script NÃO recebe nem lê a
chave diretamente — quem lê `~/.cdsapirc` é a biblioteca `cdsapi` sozinha.

DEPENDÊNCIA NOVA: `pip install "cdsapi>=0.7.7"` (além de `cfgrib`/`xarray`/
`eccodes`, já confirmados no diagnóstico do MERGE).

ESTE SCRIPT É SOMENTE LEITURA QUANTO AO BANCO DO PROJETO — não abre conexão
com o Postgres. Ele FAZ uma chamada de rede real ao serviço do Copernicus
CDS (isso é inerente ao teste: só dá para confirmar que a conta/token
funcionam baixando algo de verdade).
================================================================================
"""

import os

# Dia de teste: 15/01/2024 — mesmo dia usado no diagnóstico do MERGE, para
# poder comparar visualmente picos de chuva e de vento no mesmo período mais
# adiante, se fizer sentido.
ANO_TESTE = 2024
MES_TESTE = 1
DIA_TESTE = 15
HORAS_TESTE = ["12:00", "15:00", "18:00", "21:00"]  # tarde/noite - janela típica de tempestade convectiva

# Recorte geográfico pequeno de teste: Nordeste (região que já apareceu como
# caso de interesse no diagnóstico Nordeste/vento com INMET). Formato CDS:
# [norte, oeste, sul, leste] em graus.
AREA_TESTE = [-2.0, -42.0, -10.0, -34.0]  # cobre aprox. PI/CE/RN/PB/PE/AL

CAMINHO_CACHE = os.environ.get(
    "CAMINHO_CACHE_ERA5_TESTE",
    f"backend/src/etl/data/raw/era5_teste/rajada_{ANO_TESTE}{MES_TESTE:02d}{DIA_TESTE:02d}.grib",
)


def baixar_arquivo_teste() -> str:
    print("[1/3] Solicitando 1 pedido pequeno de rajada de vento (fg10) ao CDS API...")
    os.makedirs(os.path.dirname(CAMINHO_CACHE), exist_ok=True)

    if os.path.exists(CAMINHO_CACHE):
        print(f"      Já em cache local ({CAMINHO_CACHE}) — pulando novo pedido.")
        return CAMINHO_CACHE

    import cdsapi

    cliente = cdsapi.Client()

    dataset = "reanalysis-era5-single-levels"
    request = {
        "product_type": ["reanalysis"],
        "variable": ["10m_wind_gust_since_previous_post_processing"],
        "year": [str(ANO_TESTE)],
        "month": [f"{MES_TESTE:02d}"],
        "day": [f"{DIA_TESTE:02d}"],
        "time": HORAS_TESTE,
        "area": AREA_TESTE,
        "data_format": "grib",
    }

    print(f"      dataset={dataset}")
    print(f"      request={request}")
    print("      (pedidos ao CDS entram numa fila - pode levar de segundos a "
          "alguns minutos, dependendo da carga do serviço)")

    try:
        cliente.retrieve(dataset, request, CAMINHO_CACHE)
    except Exception as exc:  # noqa: BLE001 - diagnóstico exploratório
        raise SystemExit(
            f"[ERRO] Pedido ao CDS falhou: {type(exc).__name__}: {exc}\n\n"
            f"Causas mais prováveis: (1) ~/.cdsapirc ausente ou mal formatado "
            f"(precisa ter exatamente 2 linhas: 'url: ...' e 'key: ...'); "
            f"(2) Termos de Uso do dataset '{dataset}' ainda não aceitos "
            f"manualmente na página do dataset no site do CDS; (3) nome de "
            f"variável mudou (ver forum.ecmwf.int por avisos recentes de "
            f"mudança em parâmetros de rajada). Reportar esta mensagem "
            f"completa para ajustar."
        ) from exc

    tamanho_kb = os.path.getsize(CAMINHO_CACHE) / 1024
    print(f"      OK — {tamanho_kb:.0f} KB salvos em {CAMINHO_CACHE}")
    return CAMINHO_CACHE


def inspecionar_estrutura(caminho: str) -> None:
    print("\n[2/3] Abrindo com cfgrib/xarray...")

    import xarray as xr

    ds = xr.open_dataset(caminho, engine="cfgrib")

    print(f"      Variáveis: {list(ds.data_vars)}")
    print(f"      Dimensões: {dict(ds.sizes)}")
    print(f"      Coordenadas: {list(ds.coords)}")

    print("\n[3/3] Detalhe por variável:")
    for nome_var, var in ds.data_vars.items():
        atributos_relevantes = {
            chave: var.attrs.get(chave)
            for chave in ("long_name", "units", "GRIB_shortName", "GRIB_paramId", "GRIB_name")
            if chave in var.attrs
        }
        print(f"\n  Variável '{nome_var}':")
        print(f"    shape={var.shape}, dtype={var.dtype}")
        print(f"    atributos: {atributos_relevantes}")

        try:
            recorte = var.values[..., :5, :5] if var.ndim >= 2 else var.values.flatten()[:10]
            print(f"    amostra de valores (canto da grade, m/s esperado): \n{recorte}")
            print(f"    max={float(var.values.max()):.2f}  min={float(var.values.min()):.2f}  "
                  f"media={float(var.values.mean()):.2f}")
        except Exception as exc:  # noqa: BLE001
            print(f"    [AVISO] não consegui extrair amostra/estatística: {exc}")


def main():
    print("Diagnóstico de leitura ERA5 — rajada de vento (estágio 0 da POC)")
    print("=" * 78)

    caminho = baixar_arquivo_teste()
    inspecionar_estrutura(caminho)

    print("\n✅ Diagnóstico concluído (não gravou nada no banco do projeto).")
    print("   Próximo passo: se os valores parecerem plausíveis (m/s de rajada,")
    print("   não NaN/zero generalizado), escrever a prova de conceito completa")
    print("   (agregação mensal por município via ponto de grade mais próximo do")
    print("   centroide + comparação com INMET), mesmo padrão do script do MERGE.")


if __name__ == "__main__":
    main()
