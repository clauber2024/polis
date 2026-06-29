# Plano: Qualidade de Fornecimento de Energia Elétrica (FIC/DIC) — BDGD/ANEEL

> Documento de planejamento, criado em 29/06/2026 a partir de achado em
> estudo prévio do Polis. Nada deste plano foi implementado ainda.

## Origem deste plano

Identificado ao revisar um estudo prévio do Polis sobre justiça energética
(setembro/2022, `polis.org.br/estudos/justica-energetica/`), que já
cruzou 3 capitais — Rio de Janeiro, Maceió e **Rio Branco (AC)** — com:
1. Pobreza energética multidimensional (MEPI)
2. Aglomerados subnormais do IBGE (2019) × indicadores censitários (renda,
   raça, esgoto, água, iluminação pública)
3. **Qualidade do fornecimento de energia elétrica** (FIC/DIC — Frequência
   e Duração de Interrupção Individual por Unidade Consumidora),
   segmentada por classe, raça e tipo de assentamento, usando dados da
   ANEEL obtidos via LAI

## Por que isso é relevante para o Atlas

O cruzamento (3) é uma DIMENSÃO QUE O ATLAS AINDA NÃO TEM: o Atlas mede
PRESENÇA de MMGD, mas não mede QUALIDADE do fornecimento de energia em si
— um território pode ter MMGD presente e ainda sofrer com rede instável
(mais interrupções, mais duradouras). Isso é conceitualmente distinto e
complementar à tese da dimensão Moradia (ver
`docs/PLANO_MORADIA_TERRITORIO_POPULAR.md`), mas tratado como FRENTE
PRÓPRIA: mede o serviço elétrico em si, não a condição habitacional. Os
dois cruzam fortemente na tese de justiça energética — pior qualidade de
serviço concentra-se nos mesmos territórios de barreira habitacional
(achado do próprio estudo do Polis) — e devem ser desenhados para permitir
cruzamento fácil (mesma chave de unidade espacial/município).

Dado real já confirmado para Rio Branco no estudo de 2022 (base: Censo
2010/Aglomerados Subnormais IBGE 2019 — desatualizado frente ao Censo 2022
que já temos, mas confirma que a metodologia funciona):
- 37 aglomerados subnormais, ~104 mil pessoas (31% da população municipal)
- Renda domiciliar média nos aglomerados: R$ 251 (vs. R$ 837 município)
- Cobertura de esgotamento sanitário nos aglomerados: 29,9% (vs. 44,3%)
- FIC/DIC piores em setores de menor renda e maior concentração negra

## Fonte identificada: BDGD (Base de Dados Geográfica da Distribuidora)

CONFIRMADO nesta sessão: a BDGD é dado aberto OFICIAL da ANEEL, no MESMO
portal já usado para o extractor de MMGD (`dadosabertos.aneel.gov.br`),
com API para consultas automatizadas. Contém modelo geográfico dos
sistemas elétricos reais das distribuidoras — ativos, dados técnicos e
comerciais por Unidade Consumidora, incluindo (conforme metodologia do
estudo do Polis) os indicadores de continuidade do serviço.

Arquivos identificados (nomenclatura sugere segmentação por classe/tensão):
```
UCAT_PJ.csv  — Unidades Consumidoras Pessoa Jurídica, Alta Tensão
UCBT_PJ.zip  — Unidades Consumidoras Pessoa Jurídica, Baixa Tensão
```
(arquivos de Pessoa Física / residencial, mais relevantes para o Atlas,
ainda não localizados especificamente — próximo passo)

Também disponível via ArcGIS Open Data, com mais opções de formato:
```
https://dadosabertos-aneel.opendata.arcgis.com/
```
Download em CSV, KML, Zip, GeoJSON, GeoTIFF; API para GeoServices/WMS/WFS.

⚠️ **Atenção de escala**: a BDGD é "modelo geográfico dos sistemas elétricos
reais" — isso sugere dado em nível de ATIVO DE REDE (transformador, poste,
linha), potencialmente um volume MUITO maior que os ~4,5 milhões de
registros que já processamos para MMGD. Avaliar tamanho/viabilidade antes
de comprometer a uma extração nacional completa.

## Próximos passos (sessão futura)

1. Localizar e confirmar metadados da BDGD especificamente para
   FIC/DIC residencial (não PJ) — os arquivos vistos são de Pessoa
   Jurídica, ainda falta confirmar o equivalente residencial
2. Avaliar volume de dados antes de comprometer a extração nacional
3. Decidir se a granularidade é por Unidade Consumidora individual
   (exigindo agregação por município, como fizemos com MMGD) ou se já
   vem agregada
4. Contatar a equipe do Polis responsável pelo estudo de 2022 — eles já
   têm experiência prática de extração/tratamento desta base via LAI, o
   que pode poupar bastante tempo de tentativa e erro
5. Decidir estrutura de schema: provavelmente nova tabela (ex:
   `qualidade_fornecimento`), com FK para `unidades_espaciais`, contendo
   `fic_medio`, `dic_medio`, por período de referência — seguindo o mesmo
   padrão de `mmgd_indicadores`

## Atualização necessária no DRF/CLAUDE.md

Adicionar à lista de fontes de dados primárias: "BDGD — Base de Dados
Geográfica da Distribuidora (ANEEL)". Adicionar nova dimensão ao
escopo do projeto: "Qualidade de Fornecimento de Energia Elétrica",
com indicadores FIC/DIC por município (e, quando possível, segmentado por
classe de UC residencial — RE1 geral, RE2 baixa renda — replicando a
metodologia já validada pelo Polis em 2022).
