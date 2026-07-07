# Receita: Extractor ETL Python idempotente

**Quando usar:** ao criar um novo script em `backend/src/etl/loaders/` para carregar
uma fonte de dado externa (ANEEL, IBGE/SIDRA, RAIS/BigQuery etc.), ou ao revisar um
extractor existente.

**Referência real:** `backend/src/etl/loaders/extrair_mmgd_aneel.py` (o mais completo
em comentários de decisão) e `backend/src/etl/loaders/seed_municipios.py`.

---

## Estrutura do arquivo

Todo extractor tem extração + transformação + carga no mesmo arquivo (não há
`extractors/transformers/loaders/` separados — ver `CLAUDE.md`, Seção 2, sobre por
que essa divisão não foi adotada). O padrão real é:

```python
def carregar_dados(caminho: str) -> pd.DataFrame:
    print("[1/4] Lendo ...")
    ...

def extrair_periodo_referencia(df) -> str:
    print("[2/4] ...")
    ...

def agregar_por_municipio(df) -> pd.DataFrame:
    print("[3/4] Agregando ...")
    ...

def executar_upsert_x(engine, agregado, periodo_referencia):
    print("[4/4] Inserindo/atualizando ...")
    ...

def main():
    ...

if __name__ == "__main__":
    main()
```

Etapas numeradas (`[N/total]`) no terminal são obrigatórias (CLAUDE.md, Seção 4) —
qualquer sessão futura rodando o script sabe onde ele está e o que falhou, sem
precisar ler o código.

## Problema 1: uma transação para todo o lote mascara sucessos como falhas

**O que já aconteceu de fato:** o primeiro extractor de MMGD usava uma única
transação (`engine.begin()`) em volta do loop inteiro. Um único erro de foreign key
(código IBGE inválido vindo da fonte) marcava a transação inteira como abortada, e
todos os upserts seguintes falhavam em cascata com `InFailedSqlTransaction` — mesmo
sendo dados perfeitamente válidos. Resultado: "0 municípios inseridos" com 5.568 de
5.569 linhas corretas.

**Padrão correto** (`executar_upsert_mmgd`, `extrair_mmgd_aneel.py`):

```python
for i, linha in agregado.iterrows():
    unidade_espacial_id = f"municipio:{linha['codigo_ibge']}"
    try:
        with engine.begin() as conexao:      # uma transação POR LINHA
            conexao.execute(sql_upsert, {...})
        inseridos += 1
    except Exception as e:
        falhas.append((linha["codigo_ibge"], str(e)))
```

Nunca abrir `engine.begin()` fora do loop quando o loop faz upsert por
município/registro.

## Problema 2: FK rejeitando silenciosamente vs. pré-filtro explícito

Fontes externas trazem códigos IBGE espúrios (erro de cadastro na origem — ex.: um
valor que não corresponde a nenhum município real). Deixar a foreign key rejeitar
esses registros produz um erro de banco genérico, difícil de auditar depois.

**Padrão correto** (`filtrar_municipios_existentes`, `extrair_mmgd_aneel.py`): buscar
os códigos válidos ANTES do upsert, separar os inválidos, e reportá-los
explicitamente:

```python
def filtrar_municipios_existentes(engine, agregado):
    with engine.connect() as conexao:
        resultado = conexao.execute(text("SELECT codigo_ibge FROM municipios"))
        codigos_validos = {linha[0] for linha in resultado}

    mascara_valida = agregado["codigo_ibge"].isin(codigos_validos)
    invalidos = agregado[~mascara_valida]
    if len(invalidos) > 0:
        print(f"[AVISO] {len(invalidos)} código(s) IBGE não existem na base "
              f"territorial — serão IGNORADOS: ...")
    return agregado[mascara_valida].copy()
```

Todo extractor deve fazer esse pré-filtro antes do upsert (regra em CLAUDE.md, Seção 4).

## Problema 3: geometria grande derrubando a conexão

Municípios com geometria muito detalhada (ex.: Jutaí/AM) geram WKT (texto) de ~3
milhões de caracteres, o que já derrubou a conexão com o banco em produção.

**Padrão correto:** transportar geometria sempre como **WKB binário**
(`geometry.wkb`), nunca WKT textual. Ver `seed_municipios.py` para o padrão de
carga de geometria.

## Problema 4: `.sum()` do pandas mascara nulo como zero

`df["coluna"].sum()` trata `NaN` como 0 silenciosamente — isso confunde "dado
realmente zero" com "dado ausente". Padrão correto (`agregar_por_municipio`,
`extrair_mmgd_aneel.py`): contar e reportar nulos em colunas críticas **antes** de
agregar, e decidir explicitamente o que fazer com cada caso:

```python
nulos_potencia = df["MdaPotenciaInstaladaKW"].isna().sum()
if nulos_potencia > 0:
    print(f"[AVISO] {nulos_potencia} linha(s) com potência nula — "
          f"serão tratadas como 0 na soma (não descartadas).")
```

A escolha entre "tratar nulo como 0" e "descartar a linha" deve sempre ser
justificada em comentário — não existe default correto universal (ver receita
[`05-notas-metodologicas.md`](./05-notas-metodologicas.md)).

## Checklist rápido para um novo extractor

Baseado em CLAUDE.md, Seção 4:

1. Etapas numeradas (`[1/N]`) e avisos (`[AVISO]`)/erros (`[ERRO]`) explícitos no
   terminal.
2. Transação por linha/registro no upsert, nunca uma única transação para o lote.
3. Geometria (quando houver) transportada como WKB, nunca WKT.
4. Pré-filtro de códigos IBGE inexistentes antes do upsert, reportado separadamente.
5. `ON CONFLICT ... DO UPDATE` (idempotente), nunca `INSERT` puro.
6. Nunca usar Anaconda/conda — sempre `backend/src/etl/venv/`.
7. Contagem final de sucesso/falha ao terminar (`main()`).
