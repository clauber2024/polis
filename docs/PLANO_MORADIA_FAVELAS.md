# Plano: Dimensão Moradia — Favelas e Comunidades Urbanas

> Documento de planejamento. Nada deste plano foi implementado ainda — fonte
> de dados e estrutura confirmadas, schema/extractors ainda por escrever.
> Gerado em sessão de trabalho de 29/06/2026.

## Por que esta dimensão

O Polis (organização por trás do Atlas) tem atuação histórica com moradia.
Atualmente o Atlas só trata moradia indiretamente (via indicadores de
infraestrutura urbana — água, esgoto, lixo — que são proxies, não medidas
diretas de precariedade habitacional). Esta dimensão adiciona moradia como
recorte territorial e temático explícito, em dois níveis:

1. **Indicador agregado por município** — entra no índice de vulnerabilidade
   já existente (`indicadores_sociais`)
2. **Favelas/Comunidades Urbanas como unidades espaciais próprias** — usando
   a tabela `unidades_espaciais` já preparada para granularidade variável

## Fonte confirmada

**Censo Demográfico 2022: Favelas e Comunidades Urbanas — Resultados do
Universo** (IBGE), segunda edição, divulgada com correções até 10/04/2026.

- Recenseamento completo (questionário Básico/Universo), não amostra
- Nomenclatura nova desde 2024: "Favelas e Comunidades Urbanas" substituiu
  "Aglomerados Subnormais"
- Cobertura nacional: 16.390.790 pessoas, 6.556.968 domicílios (números da
  2ª edição corrigida)
- Recortes geográficos disponíveis: Brasil, Grande Região, UF, Concentração
  Urbana, **Município**, **Favela e Comunidade Urbana** (cada favela é
  identificada e nomeada individualmente)

## Arquivos geoespaciais confirmados (download direto, sem autenticação)

```
Polígonos das favelas (setorizadas):
https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Favelas_e_comunidades_urbanas_Resultados_do_universo/arquivos_vetoriais/poligonos_FCUs_shp.zip

Cartograma (visualização alternativa, não usar para geometria real):
https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Favelas_e_comunidades_urbanas_Resultados_do_universo/arquivos_vetoriais/FCUs_Brasil_cartograma_shp.zip

Favelas não setorizadas (atualizado 10/04/2026 — corrigiu inconsistências):
https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Favelas_e_comunidades_urbanas_Resultados_do_universo/arquivos_vetoriais/FCUs_nao_setorizadas_shp_20260410.zip

Lista de setores censitários por favela (planilha):
https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Favelas_e_comunidades_urbanas_Resultados_do_universo/Anexos/FavelaseComunidadesUrbanas2022Setores_20250417.xlsx
```

⚠️ Atenção ao baixar: o domínio é `ftp.ibge.gov.br` (não `geoftp.ibge.gov.br`,
usado para a malha municipal) — já tivemos problema de certificado SSL com
domínios IBGE antes (resolvido com `curl -k` como contorno pontual). Testar
e confirmar se este subdomínio tem o mesmo problema antes de assumir.

## Tabelas SIDRA — AINDA NÃO CONFIRMADAS (próximo passo)

A página de tabelas (`sidra.ibge.gov.br/pesquisa/censo-demografico/demografico-2022/universo-favelas-e-comunidades-urbanas`)
é uma SPA bloqueada para fetch direto. Repetir o mesmo processo já usado
para água/esgoto/lixo/alfabetização:

```bash
python3 -c "
import requests
r = requests.get('https://servicodados.ibge.gov.br/api/v3/agregados', timeout=20)
dados = r.json()
grupo_censo = next(g for g in dados if g['id'] == 'CD')
for ag in grupo_censo['agregados']:
    nome = ag['nome'].lower()
    if 'favela' in nome or 'comunidade' in nome and 'urbana' in nome:
        print(' -', ag['id'], '-', ag['nome'])
"
```

Indicadores prováveis a buscar (já vistos em buscas anteriores, números de
tabela NÃO confirmados ainda):
- População total residente em Favelas e Comunidades Urbanas, por município
- Número de domicílios em Favelas e Comunidades Urbanas, por município
- Características urbanísticas do entorno: pavimentação, iluminação pública,
  calçada, rampa para cadeirante, arborização (pesquisa específica, mencionada
  na divulgação de 05/12/2025 — ver Tabela mencionada em
  `sidra.ibge.gov.br/pesquisa/censo-demografico/demografico-2022/universo-caracteristicas-urbanisticas-do-entorno-dos-domicilios-nas-favelas-e-comunidades-urbanas`)

## Estrutura de dados proposta (schema)

### 1. Indicador agregado em `indicadores_sociais` (ALTER TABLE simples)

```sql
ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS percentual_populacao_favela double precision;
```

Cálculo: população em FCU do município / população total do município
(população total já vem da Tabela 9923, já usada para densidade).

### 2. Favelas como unidades espaciais (requer decisão de schema)

Opção A (recomendada, consistente com o padrão já estabelecido): usar o
mesmo `unidades_espaciais` que já existe, com:
```
tipo: 'favela_comunidade_urbana'
id: 'favela:{codigo_da_favela_no_ibge}'
municipio_pai_codigo_ibge: <município onde está>
geom: <polígono do shapefile>
nome_exibicao: <nome da favela, ex: "Rocinha">
```

Isso não exige nova tabela — só popular `unidades_espaciais` com um novo
`tipo`, exatamente a flexibilidade que essa tabela foi desenhada para ter
(RF-038 do DRF: "granularidade é um atributo do dado, não da arquitetura").

### 3. Indicadores específicos de infraestrutura da favela (tabela nova)

A pesquisa de Características Urbanísticas do Entorno tem estrutura
conceitual diferente de `indicadores_sociais` (é sobre a VIA/RUA, não sobre
o domicílio) — sugiro tabela própria, ex: `infraestrutura_entorno_favelas`,
com FK para `unidades_espaciais.id` (tipo='favela_comunidade_urbana'),
contendo colunas como `percentual_vias_pavimentadas`,
`percentual_iluminacao_publica`, `percentual_calcada`, etc. — schema exato
a definir depois que os números de tabela SIDRA forem confirmados.

## Sequência de implementação sugerida (próxima sessão)

1. Confirmar números de tabela SIDRA (população/domicílios por FCU e por
   município; características urbanísticas do entorno)
2. Baixar e inspecionar o shapefile de polígonos das favelas (confirmar
   colunas: código da favela, nome, município, etc. — mesmo processo já
   feito para o shapefile de municípios)
3. Schema: ALTER TABLE indicadores_sociais (percentual_populacao_favela) +
   nova tabela de infraestrutura do entorno
4. Extractor 1: população/domicílios por município (agregado, simples,
   mesmo padrão dos extractors SIDRA já escritos)
5. Extractor 2: seed das unidades espaciais de favela (geometria do
   shapefile + nome + município pai) — análogo ao seed_municipios.py
6. Extractor 3: características urbanísticas do entorno, por favela

## Atualização necessária no DRF/CLAUDE.md

Adicionar à lista de fontes de dados primárias: "Censo 2022: Favelas e
Comunidades Urbanas (IBGE)". Adicionar RF cobrindo exibição de favelas como
camada de mapa nos municípios onde existem, com indicadores próprios de
infraestrutura do entorno — indo além do que o RF-040/041 já previam (que
tratavam de "granularidade sub-municipal" de forma genérica/hipotética;
agora temos uma fonte real e nomeada para isso).
