# Plano: Dimensão Moradia, Território Popular e Barreiras Habitacionais à MMGD

> Documento de planejamento, revisado em 29/06/2026 após reformulação
> conceitual. Nada deste plano foi implementado ainda, exceto onde indicado.

## Tese central desta dimensão

> Acesso à MMGD não depende apenas de renda. Depende também da condição de
> moradia. O modelo atual tende a favorecer proprietários de imóveis
> regulares, com estabilidade de permanência e capacidade física/financeira
> de instalação. Por isso, a democratização da energia solar exige olhar
> para política habitacional, regularização fundiária, locação, coabitação,
> HIS e inadequação habitacional.

Esta tese é o que diferencia esta dimensão das demais já implementadas
(Infraestrutura Urbana, Renda e Trabalho, Capital Humano): aquelas medem
PRIVAÇÃO socioeconômica; esta mede uma BARREIRA ESTRUTURAL — jurídica e
física — que pode existir mesmo onde a renda não é o fator limitante. Duas
famílias com renda equivalente, uma proprietária e outra inquilina, têm
acesso estruturalmente desigual à MMGD no modelo atual. Cada eixo abaixo
operacionaliza esta tese com uma fonte de dado diferente.

> Ver também `docs/PLANO_QUALIDADE_FORNECIMENTO_BDGD.md` — frente
> relacionada (mas conceitualmente distinta) sobre qualidade do
> fornecimento de energia elétrica, identificada a partir de um estudo
> prévio do Polis que já cruzou essa dimensão com aglomerados subnormais
> em Rio Branco (AC), entre outras capitais.

## Mudança de enquadramento (importante)

A primeira versão deste plano tratava "moradia" como sinônimo de "favela"
(Censo 2022: Favelas e Comunidades Urbanas). Essa categoria isolada é
insuficiente: ela não captura segurança da posse, regime de ocupação
(proprietário/inquilino), inadequação construtiva, nem a relação entre
política habitacional pública e acesso à MMGD.

O enquadramento correto, alinhado com a atuação histórica do Polis em
moradia, é tratar esta como:

**Dimensão — Moradia, território popular e barreiras habitacionais à MMGD**

Perguntas orientadoras:
- Acesso à MMGD depende só de renda, ou também de regime de ocupação,
  segurança da posse e condição física da moradia?
- A MMGD chega aos territórios populares de moradia?
- O modelo atual de acesso à solar favorece proprietários com imóvel
  regularizado?
- Habitação social tem sido usada como vetor de democratização da energia
  solar, ou os conjuntos populares ficaram fora?
- Onde a precariedade habitacional exige soluções coletivas (geração
  compartilhada, cooperativa), e não apenas instalação individual?
- Quais territórios combinam vulnerabilidade social, insegurança
  habitacional e baixa presença de MMGD?

## Os 5 eixos (e viabilidade de cada um, avaliada nesta sessão)

### Eixo 1 — Segurança da posse e regularização fundiária
**Indicador:** `barreira_fundiaria_solar` = alta presença de
informalidade/ZEIS/REURB + baixa MMGD residencial.

**Viabilidade nacional:** BAIXA. Não existe base nacional uniforme — é
definida município a município em plano diretor local, e o PRÓPRIO NOME DO
INSTRUMENTO VARIA por município (ver achado importante abaixo).

**⚠️ ACHADO IMPORTANTE — nomenclatura não padronizada:** o instrumento
jurídico-urbanístico que o Estatuto da Cidade chama de "Zonas Especiais de
Interesse Social" não tem nome único nas cidades brasileiras:
- São Paulo, Recife, maioria das cidades: **ZEIS**
- **Rio de Janeiro: AEIS** (Área de Especial Interesse Social) — nome
  diferente, mesmo conceito jurídico
- Outras cidades: **SEHIS** (Setores Especiais de Habitação de Interesse
  Social)

Isso significa que um futuro extractor multi-capital não pode buscar
"ZEIS" como termo de busca universal — precisa de um mapeamento
município→nome-do-instrumento-local antes de buscar a camada de dado.

**Viabilidade reduzida a capitais (27 municípios): MÉDIA-ALTA, confirmada
em duas capitais nesta sessão:**

- **São Paulo (ZEIS)**: CONFIRMADO. GeoSampa
  (`geosampa.prefeitura.sp.gov.br`) disponibiliza shapefile de ZEIS do Plano
  Diretor Estratégico (Lei nº 16.050/14, Mapa 4), com 4 subtipos (ZEIS 1:
  favelas/loteamentos irregulares/HIS existente; ZEIS 2: glebas vazias para
  HIS nova; ZEIS 3: imóveis ociosos/cortiços em áreas centrais; ZEIS 4: APA
  de mananciais), além de camadas separadas de Favela, Cortiço e Loteamento
  Irregular. ⚠️ Portal tem CAPTCHA — download manual funciona, automação via
  script pode ser bloqueada.

- **Rio de Janeiro (AEIS)**: CONFIRMADO nesta sessão. Camada oficial
  "AEIS - Área de Especial Interesse Social - Habitação", validada pela
  Secretaria Municipal de Habitação, disponível em:
  ```
  https://www.data.rio/maps/4fafa31418274fb185b3a94c4672f95a
  ```
  Também replicada via ArcGIS Hub público (potencialmente mais fácil de
  automatizar, sem CAPTCHA):
  ```
  https://datario-pcrj.hub.arcgis.com/datasets/ac12b0d378d44f75a86042aad13b8741
  ```
  Dado quantitativo de contexto: quase 1.000 AEIS demarcadas no Rio, sendo
  33,84% caracterizadas como favela e quase 2/3 como loteamento irregular —
  confirma que AEIS/ZEIS é categoria mais ampla que "favela" isolada
  (reforça o Eixo 5).

- **Recife (ZEIS, via PREZEIS historicamente)**: PARCIALMENTE CONFIRMADO,
  com ressalva importante. O dataset "Zoneamento - Plano Diretor" no Portal
  de Dados Abertos do Recife (`dados.recife.pe.gov.br`, ID do dataset
  `bcfc3a28-db91-424f-b1ea-7dd6626a100c`) está ATIVO — confirmado pois
  outro recurso do mesmo dataset (Área de Reestruturação Urbana - ARU)
  respondeu com sucesso. ⚠️ TESTADO NESTA SESSÃO: a URL de download direto
  do recurso específico de ZEIS encontrada na indexação (`pd2021_zeisv15.geojson`,
  resource_id `e2654c4a-...`) retornou **404** — esse recurso específico
  parece ter sido descontinuado/substituído, mas o dataset-pai continua
  ativo. **Próximo passo necessário:** acessar manualmente
  `dados.recife.pe.gov.br/dataset/zoneamento` no navegador para achar o
  resource_id atual de ZEIS (não automatizável só com as ferramentas desta
  sessão, que não conseguiram fetch da página de listagem).

  **Achado extra relevante**: o mesmo portal tem outro dataset, com
  "Códigos identificadores; tipo de aglomerado (favela, cortiço,
  loteamento); área; nome do aglomerado; nome popular do local; endereço
  completo e coordenadas" — isto é uma camada de TIPOLOGIAS POPULARES
  (Eixo 5) já pronta e separada do ZEIS, com nome próprio por aglomerado
  (como o Censo 2022 Favelas e Comunidades Urbanas, mas em escala
  municipal/mais granular). Nome exato do dataset e resource_id ainda não
  identificados — mesma ressalva de navegação manual necessária.

  Confirma também o histórico: primeira experiência nacional de ZEIS,
  iniciada nos anos 1980 via PREZEIS (Plano de Regularização das Zonas
  Especiais de Interesse Social), com Comissões de Urbanização e
  Legalização da Posse da Terra (COMUL) — uma busca trouxe até um decreto
  municipal real (2006) nomeando representantes comunitários da COMUL da
  ZEIS Mustardinha, evidenciando que o instrumento tem institucionalidade
  viva e contínua, não apenas histórica.

- **Belo Horizonte (achado extra, não buscado deliberadamente)**: portal
  `dados.pbh.gov.br` tem pelo menos 2 datasets relevantes — "Áreas de
  Especial Interesse Social - AEIS - Lei 7166/96" (com EPSG 31983
  informado) e "Conjunto Habitacionais Regularizados" (cruza AEIS-1/ZEIS-1
  com unidades habitacionais regularizadas, série 2005-2021, CSV). BH usa
  tanto "AEIS" quanto "ZEIS" no mesmo município (terminologia mista) —
  outro padrão de nomenclatura a documentar. NÃO investigado em
  profundidade ainda, mas portal e dataset já localizados.

- **Padrão confirmado, agora com 3 capitais**: cada capital usa portal E
  NOMENCLATURA própria (GeoSampa/ZEIS, shapefile+CAPTCHA ≠ DATA.RIO/AEIS,
  ArcGIS Hub ≠ dados.recife/ZEIS, GeoJSON direto ≠ dados.pbh/AEIS+ZEIS
  mistos, CSV+SHP). NÃO existe um extractor genérico reaproveitável como o
  que fizemos para SIDRA/IBGE — cada capital exigirá investigação e
  extractor individual, incluindo descobrir o nome local do instrumento
  antes de buscar a fonte de dado.

**Recomendação:** tratar como projeto de pesquisa município por município,
com navegação manual do portal em cada caso (links indexados por buscadores
frequentemente ficam desatualizados — confirmado nesta sessão com Recife).
Das 3 capitais mapeadas, nenhuma tem ainda um link de download 100%
validado de ponta a ponta — todas precisam de uma sessão de navegação
manual do portal correspondente antes de escrever o extractor:
- São Paulo: portal certo (GeoSampa), mas tem CAPTCHA
- Rio de Janeiro: portal certo (DATA.RIO/ArcGIS Hub), link de visualização
  confirmado mas download programático ainda não testado
- Recife: dataset confirmado ativo, mas resource_id específico de ZEIS
  mudou e precisa ser re-localizado manualmente

### Eixo 2 — Habitação de interesse social e programas habitacionais
**Indicador:** `HIS_sem_solar` = municípios com alto volume de habitação
social e baixa presença de MMGD/geração compartilhada.

**Viabilidade:** NÃO INVESTIGADA ainda. Hipótese: dados de empreendimentos
MCMV existem publicamente via Caixa Econômica/Ministério das Cidades, mas
API/CSV aberto granular por município ainda não foi verificado.
**Próximo passo:** pesquisar fonte de dados do MCMV (substituído por "Minha
Casa Minha Vida" relançado, verificar nome/programa atual em 2026).

### Eixo 3 — Aluguel, coabitação e ônus excessivo com moradia
**Indicadores:** % domicílios alugados × MMGD residencial PF; ônus
excessivo com aluguel × baixa MMGD; coabitação/adensamento × baixa MMGD.

**Status: ✅ IMPLEMENTADO nesta sessão (29/06/2026).** Tabela SIDRA 9928,
Censo 2022, nível municipal. Extractor: `extrair_moradia_censo.py`.
Indicadores gravados: `percentual_domicilio_proprio`,
`percentual_domicilio_alugado`, `percentual_domicilio_cedido` (proxy
parcial de coabitação), além de `percentual_cortico` (Eixo 5, mesma fonte).
5.570 de 5.570 municípios carregados com sucesso.

Achado de validação: São Paulo tem a MENOR % próprio (65,8%) e MAIOR %
alugado (28,4%) e cortiço (0,66%) entre os municípios de referência do DRF,
apesar de ter os MELHORES indicadores de infraestrutura/educação —
confirma que esta dimensão mede algo estrutural, não redutível a privação
socioeconômica geral.

**Pendente dentro deste eixo:** "ônus excessivo com aluguel" (% renda
comprometida com aluguel) ainda não extraído — precisa cruzar valor do
aluguel (Censo tem essa variável, "classes de aluguel nominal mensal
domiciliar", ver Tabela 287/438 nas buscas realizadas) com renda
domiciliar. Adiado para sessão futura.

### Eixo 4 — Inadequação habitacional e capacidade física de receber solar
**Indicador:** `potencial_social_sem_capacidade_individual` = alta
vulnerabilidade + moradia inadequada + baixa MMGD.

**Viabilidade:** MÉDIA. "Material predominante, paredes externas" também
está na lista de variáveis do Censo 2022 (confirmado nesta sessão, ao ler a
página de metadados do IBGE). Déficit habitacional formal é calculado pela
Fundação João Pinheiro — fonte externa adicional, ainda não investigada.

### Eixo 5 — Tipologias populares fora da categoria "favela"
Não é uma fonte de dado — é um PRINCÍPIO ORGANIZADOR: tratar
favelas/cortiços/ocupações/loteamentos irregulares/ZEIS/conjuntos
habitacionais como uma família de tipologias relacionadas, não uma
categoria única. Já confirmado como viável ao menos para São Paulo (GeoSampa
tem camadas separadas para várias dessas tipologias simultaneamente).

## Fonte já confirmada em sessão anterior: Favelas e Comunidades Urbanas (Censo 2022)

Mantém-se válido o que já foi confirmado (ver histórico): shapefiles de
polígonos de favelas, cartograma, e lista de setores, disponíveis em
`ftp.ibge.gov.br`. Esta fonte agora deve ser entendida como UM dos
componentes da dimensão mais ampla de moradia, não a dimensão inteira.

```
Polígonos: https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Favelas_e_comunidades_urbanas_Resultados_do_universo/arquivos_vetoriais/poligonos_FCUs_shp.zip
Não setorizadas: .../FCUs_nao_setorizadas_shp_20260410.zip
Lista de setores: .../Anexos/FavelaseComunidadesUrbanas2022Setores_20250417.xlsx
```

## Estrutura de dados proposta (schema) — sem alteração na lógica geral

Mantém-se a proposta original: `unidades_espaciais` com novos `tipo` por
tipologia (`'favela_comunidade_urbana'`, `'zeis'`, `'loteamento_irregular'`,
`'cortico'` conforme cada fonte for confirmada), e indicadores agregados
por município em `indicadores_sociais` para os eixos que tiverem fonte
nacional uniforme (Eixo 3 principalmente).

## Sequência de implementação recomendada (em ordem de viabilidade)

1. **Eixo 3 (regime de ocupação do domicílio)** — confirmar tabela SIDRA,
   escrever extractor (mesmo padrão já usado 4x). Fonte nacional, uniforme,
   pronta para os 5.570 municípios.
2. **Favelas e Comunidades Urbanas (já mapeado)** — confirmar tabelas SIDRA
   específicas de população/domicílios por favela, baixar e processar
   shapefile, popular `unidades_espaciais`.
3. **Eixo 1, só capitais** — começar com São Paulo (fonte já confirmada),
   depois Rio de Janeiro (confirmar camada de ZEIS no DATA.RIO), depois
   expandir capital por capital conforme tempo/prioridade.
4. **Eixo 4 (inadequação habitacional)** — confirmar tabela SIDRA de
   material de paredes/cômodos; investigar Fundação João Pinheiro para
   déficit habitacional consolidado.
5. **Eixo 2 (MCMV/HIS)** — pesquisar fonte de dados do programa habitacional
   federal atual.

## Atualização necessária no DRF/CLAUDE.md

- Adicionar a fontes de dados primárias: "Censo 2022: Favelas e Comunidades
  Urbanas (IBGE)", "Censo 2022: Regime de ocupação do domicílio (IBGE)", e
  registrar como pendentes/condicionais: portais municipais de ZEIS
  (São Paulo/GeoSampa confirmado; demais capitais a investigar), MCMV/HIS,
  Fundação João Pinheiro.
- Novo RF: exibir, nos municípios com dado disponível, indicador de
  "barreira habitacional" cruzando regime de ocupação/inadequação com
  presença de MMGD — entendendo que cobertura será desigual entre
  municípios (nacional para Eixo 3, só capitais selecionadas para Eixo 1).
- Documentar explicitamente que esta dimensão terá COBERTURA DESIGUAL
  entre municípios (diferente de MMGD/Infraestrutura/Renda, que são
  uniformes para todos os 5.570) — isso deve ficar visualmente claro na
  interface (ex: indicador "não disponível" em vez de mostrar zero/branco
  ambíguo).

