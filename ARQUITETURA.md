# ARQUITETURA.md — Estado Atual e Decisões de Dados
> Complemento ao [`CLAUDE.md`](./CLAUDE.md) (padroes tecnicos) e ao [`README.md`](./README.md).
> Este documento cobre o que muda com frequencia: estado dos dados, decisoes de fontes
> e fila de trabalho. Padroes de codigo, banco e Git estao no CLAUDE.md - nao duplicar aqui.
> Ultima atualizacao: 06/07/2026.

## Estado dos dados (pos-sessao DEC/FEC real, jul/2026)

Tabela `unidades_espaciais`:
- 5.573 municipios (`municipio:<codigo_ibge>`)
- 12.348 FCUs - Favelas e Comunidades Urbanas como unidades espaciais proprias
  (tipo `favela_comunidade_urbana`; coluna `tipo` expandida para VARCHAR(40))
- 3.696 ZEIS/AEIS em 4 capitais: RJ 1.044, SP 2.574, Recife 76, Rio Branco 2

| Dimensao | Status | Notas |
|---|---|---|
| Territorio | ok | IBGE Malha 2025, 5.573 municipios |
| MMGD | ok | ANEEL jun/2026: 5.567 mun., 50.086 MW, 8M UCs |
| Infraestrutura Urbana | ok | Censo 2022/SIDRA, 5.570 mun., 5 indicadores |
| Renda e Trabalho | ok Ampliada 06/07/2026 | RAIS 2024 via BigQuery, 5.571 mun. + RDPC (Censo 2022/SIDRA 10295+10296, `renda_per_capita_rdpc` e `percentual_baixa_renda_rdpc`, migration 0017, 5.570 mun.) |
| Moradia | ok Finalizada jul/2026 | Regime de ocupacao (Censo) + FCU + ZEIS/AEIS + inadequacao (% parede) + MCMV/FGTS (5.111 mun., 36,6M UH) + MCMV/OGU (4.883 mun., 1,7M UH) + percentual_apartamento (Censo 2022/SIDRA 9928, migration 0016, 5.570 mun. - ver secao de analise de correlacao abaixo) |
| Qualidade de Fornecimento | ok Finalizada jul/2026 | INDQUAL/ANEEL: DEC/FEC + 21 variantes por origem de interrupcao, ~4,9M registros. Conjunto eletrico -> municipio e N:N (42.661 pares); view resolve por pior-caso e media. **DEC/FEC "real" (sem expurgo de Dia Critico) fechado em 04/07/2026**: views `vw_qualidade_conjunto_real` e `vw_qualidade_municipio_real` (migration 0011), formula confirmada contra o dicionario oficial da ANEEL (`dominio-indicadores.csv`) - soma `DEC + DECINC + DECIPC + DECXNC + DECXPC` (e equivalente FEC); variantes IND/INE/INO/IP/XN/XP sao decomposicao do valor ja incluso no oficial e NAO entram na soma. Cobertura validada identica a view oficial (423.147 linhas municipio/ano/periodo em ambas) |
| Capital Humano | ok Finalizada jul/2026 | Alfabetizacao (Censo 2022) + taxa de mortalidade infantil (SIM+SINASC/DATASUS via Base dos Dados/BigQuery, media poolada 2022-2024, 5.570 mun.) |
| Irradiacao Solar | ok Finalizada jul/2026 | Atlas Brasileiro de Energia Solar (LABREN/CCST/INPE, 2a ed. 2017), GHI anual, 5.569 mun. Media climatologica 1999-2015, nao ano especifico |
| IVS Consolidado | ok Completa 06/07/2026 | Media de 3 blocos oficiais do IVS/IPEA (Infraestrutura Urbana, Renda e Trabalho, Capital Humano) sobre vw_indicadores_sociais_consolidado, normalizacao min-max. Moradia fica fora de proposito (ver indice separado). Migration 0015 |

## Decisoes de fontes (confirmadas por pesquisa, jul/2026)

- **BDGD**: publica no Portal de Dados Abertos ANEEL desde 2022 (nao precisa LAI).
  Limitacao real: arquivos `.gdb` por distribuidora, pesados, sem API nacional.
  FIC/DIC individual por UC pode estar no BDO separado, ou via LAI para cruzamentos
  especificos. UGBT/UGMT da BDGD tem MMGD georreferenciada (util para cruzamentos sub-municipais).
- **INDQUAL** (Qualidade de Fornecimento) - confirmado e carregado, jul/2026: dataset
  ANEEL "Indicadores Coletivos de Continuidade (DEC e FEC)", granularidade Conjunto
  Eletrico (3 CSVs relacionais via `dadosabertos.aneel.gov.br`): `atributos` (metadado
  do conjunto), `indicadores-continuidade-coletivos-2020-2029` (valores, formato longo -
  22 siglas carregadas, nao so DEC/FEC), `indqual-municipio` (de-para conjunto<->municipio,
  chave `IdeConjUnidConsumidoras`/`IdeConjUndConsumidoras` - nome de coluna diverge entre
  arquivos). Relacao conjunto<->municipio e N:N - schema usa tabela de juncao propria
  (`qualidade_conjunto_municipio`) + view (`vw_qualidade_municipio`) que agrega por
  pior-caso (MAX) como padrao, com media disponivel para referencia. 6 codigos IBGE da
  fonte nao existem em `municipios` (padrao `*9999`/`*9922` - massas d'agua/sem-municipio,
  esperado e ignorado no ETL). Schema criado fora do sistema formal de migrations
  (script Python direto).
- **DEC/FEC sem expurgo (real)** - fechado em 04/07/2026, migration `0011_qualidade_dec_fec_real.sql`.
  Confirmado via dicionario oficial ANEEL (`dominio-indicadores.csv`, dataset
  indicadores-coletivos-de-continuidade-dec-e-fec): sufixo "C" (`DECINC`, `DECIPC`,
  `DECXNC`, `DECXPC` e equivalentes FEC) sao as parcelas expurgadas por ocorrerem em
  "Dia Critico" (NT 071/2011-SRD/ANEEL); demais variantes (`IND`, `INE`, `INO`, `IP`,
  `XN`, `XP`) sao decomposicao do valor ja incluso no DEC/FEC oficial e nao devem ser
  somadas de novo. Views: `vw_qualidade_conjunto_real` (por conjunto/ano/periodo) e
  `vw_qualidade_municipio_real` (agregada por municipio, mesmo padrao pior-caso/media
  da view oficial). Relevante para justica energetica: eventos extremos tendem a
  concentrar em certas regioes e o numero oficial "limpo" pode mascarar isso.
- **TSEE / baixa renda** (indicador alvo: `percentual_tsee`) - BLOQUEADO ate ter dados
  de jan/2026 em diante (investigado 04/07/2026): usar dataset ANEEL "Beneficiarios da
  CDE" (`dadosabertos.aneel.gov.br/dataset/beneficiarios-da-cde`), nao os shapefiles UCBT.
  Estrutura: um arquivo ZIP por mes (nao consolidado), granularidade municipio+distribuidora.
  Dicionario de dados oficial (PDF, `dm-beneficiarios-da-cde.pdf`) esta desatualizado
  (23/11/2022) e NAO lista a subclasse "Residencial Desconto Social" criada pela Lei
  15.235/2025 - so mostra as variantes antigas de baixa renda (indigena, quilombola,
  BPC, multifamiliar). Achado critico via Voto ANEEL (41a RPO, 9/12/2025): embora a Lei
  15.235/2025 seja de julho/2025, o FATURAMENTO sob a nova subclasse so comeca em
  1o de janeiro de 2026 - arquivos mensais anteriores a essa data nao tem a subclasse
  nova, mesmo apos a lei. Proximo passo: obter um arquivo mensal de jan/2026 em diante
  (baixar manualmente via navegador, pois resource IDs de arquivos futuros nao sao
  previsiveis/pesquisaveis) e inspecionar colunas reais (`IdcSubclasse` vs `DscTipoSubsidio`)
  antes de escrever o extractor. Extractor final deve capturar as duas subclasses:
  "Residencial Baixa Renda" E "Residencial Desconto Social".
- **Censo 2022**: sem dado utilizavel de acesso a eletricidade - excluido do Eixo 4.
- **CadUnico (cobertura e pobreza)** - fechado 04/07/2026, migration
  `0013_capital_humano_cadunico.sql`. Fonte: MDS/SAGI, servico Solr publico
  "MI Social" (`aplicacoes.mds.gov.br/sagi/servicos/misocial`) - API viva,
  NAO e arquivo estatico, atualizada mensalmente. Achado importante: a
  documentacao antiga do dataset (Portal de Dados Abertos, 2021) tem nomes
  de campo desatualizados (`cadunico_tot_fam` nao existe mais - campo real
  e `cadun_qtd_familias_cadastradas_i`) - sempre confirmar via `fl=*` antes
  de usar. Codigo IBGE desta fonte tem 6 digitos (sem digito verificador,
  ex: Sao Paulo = 355030) - join feito comparando com os 6 primeiros digitos
  do codigo_ibge de 7 digitos da base territorial. Duas metricas gravadas:
  `percentual_cadunico` (coluna ja existente desde o scaffold original) =
  cobertura (pessoas cadastradas / populacao total x 100); `percentual_
  pobreza_cadunico` (nova) = das familias JA cadastradas, % em situacao de
  pobreza ou extrema pobreza. Periodo de referencia: 202512 (dez/2025,
  mes mais recente disponivel). Cobertura: 5.570/5.573 municipios (3 sem
  correspondencia). RESSALVA DE QUALIDADE DE DADO: alguns municipios
  pequenos do Norte/Nordeste (ex: Itaubal/AP 129%, Sebastiao Barros/PI 125%)
  apresentam `percentual_cadunico` ACIMA de 100% - fenomeno conhecido de
  descompasso entre a populacao do Censo 2022 (subestimada em areas remotas)
  e o numero de pessoas cadastradas no CadUnico (que pode incluir registros
  de quem migrou e nao foi baixado do sistema) - nao e erro do extractor,
  e limitacao conhecida da fonte, documentar ao exibir este indicador.
  Este indicador e um dos 4 insumos previstos para o futuro "Indice de
  Pobreza Energetica Regional" (RF-080 do DRF: IBGE, CadUnico, TSEE,
  IVS/IPEA) - o indice completo continua bloqueado pelo TSEE (ver acima),
  mas o CadUnico em si ja e indicador valido e utilizavel isoladamente.
  Extractor: `backend/src/etl/loaders/extrair_cadunico.py`.
- **Irradiacao Solar (INPE/LABREN)** - fechado 04/07/2026. Fonte: Atlas
  Brasileiro de Energia Solar, 2a edicao (2017), LABREN/CCST/INPE
  (`labren.ccst.inpe.br/atlas_2017.html`), extrato CSV "Sedes de Municipios"
  (nao a grade completa 0.1x0.1 grau - evita interpolacao espacial propria).
  Variavel: Irradiacao Global Horizontal (GHI) media anual, convertida de
  Wh/m2.dia para kWh/m2.dia. DADO E MEDIA CLIMATOLOGICA DE 17 ANOS
  (1999-2015), nao um ano especifico - gravado com periodo_referencia =
  2017-01-01 (ano de publicacao) apenas como convencao de chave. LICENCA
  CC BY-NC-ND: uso nao-comercial permitido, mas NAO pode ser usado para
  fins comerciais sem autorizacao do INPE - citar sempre como "LABREN/CCST/
  INPE". Fonte NAO tem codigo IBGE - join feito por NOME+ESTADO normalizado
  (maiusculas, sem acento). Exigiu tabela de alias manual para 21 dos 5.573
  municipios (grafias antigas, hifen vs espaco, DE/DO) - achado notavel:
  a propria fonte do INPE tem um ERRO DE DADO real, a linha de "Porto
  Alegre" (capital do RS) esta rotulada com estado "RIO GRANDE DO NORTE"
  (confirmado via coordenadas - corrigido no extractor). Cobertura final:
  5.569/5.573 municipios (os 4 ausentes sao genuinos: Fernando de Noronha,
  2 placeholders de corpo d'agua no RS, e Boa Esperanca do Norte/MT sem
  correspondencia). Schema ja existia desde a migration 0000 (tabela
  `irradiacao_solar`) - nao precisou nova migration. Extractor:
  `backend/src/etl/loaders/extrair_irradiacao_solar_inpe.py`. Dados mensais
  e outras variaveis (Direta Normal, Difusa, Plano Inclinado, PAR) do
  mesmo Atlas ainda NAO carregados - possivel expansao futura.
- **OBEPE**: referencia metodologica (Indice de Pobreza Energetica Regional), nao fonte
  primaria - ver `docs/DRF.md` secao 14.
- **"Onus excessivo com aluguel" - DESCARTADO como indicador do Atlas (achado
  definitivo, nao lacuna temporaria, sessao 06/07/2026).** Investigadas 4 fontes:
  (1) Censo 2022/SIDRA - tabelas 3524/3168/3261 citadas na pesquisa original sao do
  Censo 2010 (confirmado via metadado real, `periodicidade: 2010 a 2010`); confirmado
  via material oficial do IBGE que o bloco de Caracteristicas dos Domicilios do Censo
  2022 investigou so 6 elementos (ocupacao, paredes, comodos, dormitorios, maquina de
  lavar, internet) - valor do aluguel em reais NAO foi coletado em 2022, diferente de
  2010; (2) PNAD Continua e (3) POF - descartadas por desenho amostral nao
  representativo a nivel municipal (PNAD: nacional/UF/RMs selecionadas; POF: ~20 areas
  metropolitanas/totais estaduais); (4) CadUnico/CECAD - o dicionario oficial de
  variaveis (`Dicionario_de_Variaveis_CECAD.pdf`, PDF real conferido) TEM o campo
  `VAL_DESP_ALUGUEL_FAM` + campos de renda (`VLR_RENDA_TOTAL_FAM`, `FX_RFPC`), mas esse
  campo so existe nos microdados IDENTIFICADOS (download via CECAD "Baixar"), cujo
  acesso e restrito por perfil (confirmado no manual oficial, pagina "Quem pode ter
  acesso ao CECAD?"): so gestao municipal/estadual do CadUnico via SIGPBF, Vigilancia
  Socioassistencial via CADSUAS, servidores do Ministerio da Cidadania, ou programas
  federais mediante demanda formal - nenhuma categoria cobre um projeto como o Atlas.
  A ferramenta publica sem login (TABCAD, `cecad.cidadania.gov.br/tab_cad.php`) foi
  conferida ao vivo e NAO expoe despesa com aluguel como variavel tabulavel - so
  variaveis categoricas dos blocos 1-4/6-8/11-12 do formulario. Conclusao: as 4 fontes
  cogitadas para este indicador estao fechadas (2 por o dado nao existir na
  granularidade certa, 1 por o dado nunca ter sido coletado em 2022, 1 por restricao de
  acesso) - nao reabrir sem fonte nova. Documentado tambem em
  `docs/PLANO_MORADIA_TERRITORIO_POPULAR.md`, Eixo 3.
- **RDPC (Rendimento Domiciliar Per Capita) - fechado 06/07/2026**, migration
  `0017_indicadores_sociais_rdpc.sql`. Achado colateral da investigacao de aluguel
  acima. Metadados confirmados via API real (nao documentacao): Tabela SIDRA 10295,
  variavel 13431 (RDPC medio, R$, classificacoes Sexo/Cor ou raca/Grupo de idade
  fixadas em "Total") e Tabela 10296, variavel 1013604 (percentual do total geral),
  classificacao 386, categorias 9681+9682 somadas = % de moradores com RDPC ate 1/2
  salario minimo. Ambas confirmadas nivel municipal (N6), periodo unico 2022. RDPC
  inclui renda de TODAS as fontes (trabalho formal e informal, aposentadoria,
  beneficios, aluguel recebido etc.) - mais completo que `renda_media_domiciliar`
  atual (RAIS, so renda de trabalho formal). Extractor:
  `backend/src/etl/loaders/extrair_rdpc_censo.py`. Resultado: 5.570/5.570 municipios
  carregados (sem falhas de upsert). `renda_per_capita_rdpc`: media nacional (nao
  ponderada por municipio) R$ 1.211,59. `percentual_baixa_renda_rdpc`: media nacional
  35,24%. RESSALVA: 17 registros da Tabela 10296 vieram como "-" (zero literal,
  convencao IBGE) para as categorias 9681/9682 - provavelmente municipios pequenos
  sem moradores nessa faixa especifica, nao erro de extracao; nao investigado a fundo
  quais municipios sao (revisitar se a coluna `percentual_baixa_renda_rdpc` mostrar
  comportamento estranho nesses casos).
- **Mortalidade infantil (Capital Humano)** - fechado 04/07/2026, migration
  `0012_capital_humano_mortalidade_infantil.sql`. Fonte: SIM (obitos) + SINASC
  (nascidos vivos), ambos DATASUS, via Base dos Dados/BigQuery
  (`basedosdados.br_ms_sim.microdados` e `basedosdados.br_ms_sinasc.microdados`
  - NAO usar as tabelas pre-agregadas `municipio_causa_idade*`, estao
  desatualizadas/travadas em 2019). Taxa = media poolada 2022-2024 (soma de
  obitos infantis dividida pela soma de nascidos vivos do periodo, x 1000) -
  escolhida para reduzir ruido estatistico em municipios pequenos. Campo
  `idade` do SIM ja vem limpo em anos decimais pela Base dos Dados (nao e o
  codigo bruto do DATASUS) - filtro `idade < 1` isola automaticamente os
  obitos nao-fetais, sem precisar filtro adicional de `tipo_obito`. Validado
  contra numero nacional: 86.522 obitos / 7.487.033 nascidos (periodo
  2022-2024) = 11,56 por mil, compativel com a taxa oficial do Brasil.
  Extractor: `backend/src/etl/loaders/extrair_capital_humano_mortalidade_infantil.py`.

## Estado das migrations (corrigido 06/07/2026)

Numeracao real em `backend/src/db/migrations/`: 0000 a 0017. O schema do INDQUAL
(`qualidade_conjuntos`, `qualidade_indicadores`, `qualidade_conjunto_municipio`) foi
criado fora desse sistema formal, via script Python direto - por isso nao aparece na
pasta de migrations. Migrations mais recentes: `0014_indices_compostos_moradia_infraestrutura.sql`
(indices compostos + `vw_indicadores_sociais_consolidado`), `0015_view_ivs_consolidado.sql`
(IVS), `0016_indicadores_sociais_tipo_domicilio.sql` (`percentual_apartamento`, ver secao de
analise de correlacao abaixo), `0017_indicadores_sociais_rdpc.sql` (`renda_per_capita_rdpc`,
`percentual_baixa_renda_rdpc`, ver "Decisoes de fontes"). Proxima migration: 0018.

## Fila de trabalho

1. Cruzamento MMGD x indicadores sociais - EM ANDAMENTO (ver secao "Analise de
   correlacao MMGD x Indicadores Sociais" abaixo, sessao 06/07/2026). Metodologia
   (Spearman + parcial controlando renda + sensibilidade regiao/urbanizacao) esta
   pronta e reutilizavel; 2 casos especificos (Seguranca da Posse no Sul, Irradiacao
   Solar no Centro-Oeste) permanecem sem explicacao apos testar 3 hipoteses - ver
   "Ideias para investigar" para o proximo candidato (distribuidora/concessionaria).
2. Atualizar README e CLAUDE.md (Estado Real) com os dados das sessoes de Moradia,
   INDQUAL, DEC/FEC real, Capital Humano e Irradiacao Solar

## Bloqueado (aguardando dado externo)

- **Beneficiarios da CDE / `percentual_tsee`** - bloqueado desde 04/07/2026 ate existir
  arquivo mensal de jan/2026 em diante com a subclasse "Residencial Desconto Social"
  faturada (ver detalhes em Decisoes de fontes). Retomar quando o arquivo estiver
  disponivel no portal. TENTATIVA ADICIONAL EM 04/07/2026: tentado avancar parcialmente
  usando so a subclasse antiga "Residencial Baixa Renda" (sem "Desconto Social") com o
  arquivo mais recente disponivel (jun/25) - bloqueado por problema tecnico no proprio
  portal da ANEEL: downloads de "Beneficiarios da CDE" retornam loop de redirecionamento
  HTTP 302 (confirmado via curl -v e tambem via navegador, testado com jun/25 e mai/24).
  Outro recurso do mesmo portal ("rede-basica-2022") baixou normalmente, entao o
  problema e especifico deste dataset/recurso, nao do portal inteiro - provavelmente
  instabilidade temporaria do lado da ANEEL. Reintentar em sessao futura antes de
  investir mais tempo nisso.

  **RECONFIRMADO em 06/07/2026 - bloqueio PERSISTE, dois problemas distintos e
  independentes:**
  1. **Disponibilidade do dado**: a pagina do dataset (`dadosabertos.aneel.gov.br/
     dataset/beneficiarios-da-cde`) continua listando "jun/25" como o recurso mais
     recente - nenhum arquivo de jan/2026 em diante foi publicado ainda, apesar da
     metadata do dataset mostrar "Ultima Atualizacao: junho 12, 2026" (toque de
     indexacao da plataforma, nao conteudo novo) e "Frequencia de atualizacao: Anual"
     (isto pode explicar por que nao ha novos arquivos mensais ha mais de um ano -
     se a lista de recursos so e revisada anualmente pela ANEEL, o proximo lote pode
     demorar).
  2. **Disponibilidade tecnica**: reconfirmado via `curl -v -L` que o proprio recurso
     jun/2025 (o unico que existe) continua retornando um loop de auto-redirecionamento
     HTTP 302 - o header `location` aponta para a MESMA URL que foi requisitada,
     fazendo o curl esgotar o limite de 50 redirecionamentos (`Maximum (50) redirects
     followed`). Ou seja, mesmo que so quisessemos validar a subclasse antiga
     ("Residencial Baixa Renda", sem "Desconto Social") no arquivo ja existente, nao
     e possivel baixar nenhum arquivo deste dataset especifico agora - bug do lado do
     servidor da ANEEL, nao do cliente/rede.
  **Conclusao**: nao e mais so "aguardar o dado" - o dataset esta com um bug de
  infraestrutura persistente (mais de um mes, confirmado em 2 sessoes diferentes).
  Se isso continuar bloqueado nas proximas sessoes, considerar abrir um chamado
  formal com a ANEEL (contato do dataset: dadosabertos@aneel.gov.br) em vez de
  so tentar de novo silenciosamente.

## Ideias para investigar (nao priorizadas)

- **Perdas tecnicas e nao tecnicas** (ANEEL) - indicador de justica energetica
  potencialmente forte: perdas nao tecnicas (furto/fraude) tendem a concentrar em
  areas de baixa renda e correlacionam com fiscalizacao/corte mais agressivos nessas
  regioes. Nao investigado ainda se esta no Portal de Dados Abertos, granularidade
  (distribuidora? conjunto? municipio?) e formato. Levantado em sessao de 03/07/2026,
  ainda sem pesquisa de viabilidade.
- **Queima de equipamentos** (transformadores/eletrodomesticos por sobretensao) -
  tende a concentrar onde a rede tem pouca protecao (para-raios, aterramento)
  combinado com alta incidencia de raios (densidade de descargas atmosfericas maior
  em partes do Centro-Oeste/Norte). Possivel cruzamento: dados de protecao de rede
  (BDGD) x mapas de densidade de raios (INPE/ELAT tem esse dado). Nao investigado
  ainda se ANEEL disponibiliza reclamacoes/ressarcimentos por queima de equipamento
  em dataset aberto. Levantado em 03/07/2026.
- **Fila/capacidade de conexao de MMGD por distribuidora (grupo Equatorial)** -
  candidato levantado a partir do achado da hipotese de distribuidora/concessionaria
  (ver secao "Hipotese de distribuidora/concessionaria", sessao 06/07/2026): EQUATORIAL
  GO tem MMGD residencial per capita menos da metade de EMS/EMT no Centro-Oeste, apesar
  de irradiacao semelhante - hipotese de fila/capacidade de conexao de micro/
  minigeracao especifica do grupo Equatorial (presente tambem no Para, Maranhao, Piaui,
  Alagoas, e agora CEEE-Equatorial no RS). Nao investigado ainda se a ANEEL publica
  dado de fila de conexao/tempo de espera por distribuidora em dataset aberto.

## Indices compostos e metodologia de cruzamentos (sessao 04/07/2026)

Alinhamento da metodologia de cruzamentos previstos no DRF (RF-049 a RF-057,
RF-080). Decisoes tomadas:

- **Eixo MMGD (Y)**: usar valor PER CAPITA, nao absoluto - contagem absoluta
  favorece cidades grandes independente da taxa real de adocao. "% domicilios
  com MMGD" seria mais correto conceitualmente mas exige numero de domicilios
  do Censo, que nao esta carregado ainda - per capita e o viavel hoje.
- **Limiar dos quadrantes**: usar MEDIANA, nao media - distribuicoes assimetricas
  (poucos municipios grandes puxam a media, maioria fica artificialmente abaixo).
- **Direcao dos indicadores**: cada indicador tem metadado positivo (quanto
  maior, melhor) ou negativo (quanto maior, pior/mais vulneravel). O valor
  exibido no grafico NUNCA e transformado/invertido - a logica de quadrante
  (favoravel/desfavoravel) e calculada no backend considerando a direcao,
  mantendo os numeros exibidos identicos aos armazenados.

Indicadores negativos identificados: IVS, indice_precariedade_moradia,
indice_precariedade_infraestrutura, taxa_mortalidade_infantil, DEC/FEC
(Qualidade Fornecimento), percentual_pobreza_cadunico. Demais sao positivos.

### Achado arquitetural: fragmentacao de indicadores_sociais por periodo

A chave unica `(unidade_espacial_id, periodo_referencia)` fez cada extractor
gravar os dados do seu proprio periodo de referencia, fragmentando um mesmo
municipio em ate 4 linhas diferentes (2022-01-01, 2024-01-01, 2025-12-01,
2025-12-31), cada uma preenchida so parcialmente. Nao ha serie temporal real
intencional - e efeito colateral de cada extractor escolher seu proprio
periodo. Resolvido via `vw_indicadores_sociais_consolidado` (migration 0014),
que agrega por municipio pegando o valor nao-nulo de cada coluna (MAX, seguro
porque cada coluna so tem valor em UM periodo por municipio).

### Indices compostos de Moradia e Infraestrutura Urbana (migration 0014)

Ate esta sessao, "Infraestrutura Urbana" e "Moradia" existiam so como colunas
brutas de sub-indicadores (a `ARQUITETURA.md`/README ja diziam "indices
proprios inspirados no IVS/IPEA", mas o indice composto de fato nunca tinha
sido calculado). Construidos agora com a mesma metodologia do IVS/IPEA:
normalizacao min-max (0=melhor, 1=pior) sobre a distribuicao nacional atual,
media simples dos sub-indicadores normalizados.

**Indice de Precariedade de Infraestrutura** (negativo, 0 a 1): media
normalizada de `percentual_agua_inadequada`, `percentual_esgoto_inadequado`,
`percentual_lixo_inadequado`. Excluidos `percentual_populacao_rural` e
`densidade_populacional` (caracteristicas demograficas, nao vulnerabilidade
por si so).

**Indice de Precariedade Habitacional** (negativo, 0 a 1): media normalizada
de `percentual_cortico`, `percentual_parede_inadequada`,
`percentual_populacao_favela`. Excluidos regime de posse (ver indice proprio
abaixo) e contagens absolutas/MCMV (viesadas por tamanho ou medem
intervencao publica, nao vulnerabilidade).

**Indice de Seguranca da Posse** (positivo, 0 a 100, NOVO - decisao explicita
de nao deixar de fora regime de posse): `1,0 x %proprio + 0,5 x %alugado +
0,0 x %cedido`. Pesos refletem seguranca decrescente (proprio = maxima
seguranca; alugado = protegido por contrato mas sem propriedade; cedido =
tipicamente informal/precario). Retorna NULL (nao 0) quando os 3 campos de
origem sao nulos - 3 municipios sem nenhum dado de regime de posse (bug
corrigido durante a validacao: a primeira versao usava COALESCE(...,0) sem
guarda, fazendo esses 3 municipios aparecerem com "seguranca zero" ao inves
de "sem dado").

**Cobertura de Investimento Publico Habitacional** (positivo, unidades por
1.000 hab, NOVO - decisao explicita de nao deixar de fora investimento
publico): `(unidades FGTS + unidades OGU entregues) / populacao x 1000`.
Populacao reconstituida via `densidade_populacional x area_km2` (mesmo
metodo do extractor de RAIS).

Validado: Sao Paulo (infra 0,018 - quase o melhor do pais) vs Rio Branco/AC
(infra 0,230, moradia similar, cobertura MCMV maior per capita) - direcoes
e magnitudes plausiveis.

Views: `vw_indicadores_sociais_consolidado`, `vw_indices_compostos_moradia_infraestrutura`.

### IVS Consolidado (migration 0015, sessao 06/07/2026)

Fechando o indicador `ivs` (coluna ja existente desde o scaffold original,
citada na lista de "indicadores negativos" desta mesma secao, mas nunca
calculada ate agora). Mesma metodologia de normalizacao min-max ja usada nos
indices de Moradia/Infraestrutura (migration 0014): media dos 3 blocos
oficiais do IVS/IPEA, cada bloco = media de indicadores normalizados.

- **Bloco Infraestrutura Urbana**: media normalizada de
  `percentual_populacao_rural`, `percentual_agua_inadequada`,
  `percentual_esgoto_inadequado`, `percentual_lixo_inadequado`.
  `densidade_populacional` EXCLUIDA por ambiguidade de sinal (mesmo
  criterio ja aplicado ao indice de precariedade de infraestrutura da
  migration 0014 - baixa E alta densidade podem ambas indicar
  vulnerabilidade, por motivos opostos).
- **Bloco Renda e Trabalho**: media normalizada de `renda_media_domiciliar`
  (invertida) e `percentual_vinculos_formais` (invertida).
- **Bloco Capital Humano**: media normalizada de `taxa_alfabetizacao`
  (invertida) e `taxa_mortalidade_infantil` (nao invertida).
- **IVS** = media simples dos 3 blocos.
- Moradia (seguranca da posse, cortico, favela) fica FORA do IVS de
  proposito - eixo separado (`vw_indices_compostos_moradia_infraestrutura`),
  para permitir testar "MMGD x Seguranca da Posse" isoladamente sem diluir
  no IVS geral.

Usa `vw_indicadores_sociais_consolidado` (migration 0014) como fonte, ja
resolvendo a fragmentacao por `periodo_referencia`. Validado: 21.595 linhas
/ ~5.571 municipios com IVS calculado, distribuicao 0,09 a 0,78 (media
0,45) - plausivel para indice normalizado 0-1.

View: `vw_ivs_consolidado`.

### Analise de correlacao MMGD x Indicadores Sociais (sessao 06/07/2026)

Primeira execucao do item 1 da fila de trabalho ("Cruzamento MMGD x indicadores
sociais - identificar vazios reais de acesso"). Scripts em
`backend/src/etl/analises/` (pasta nova, fora do padrao `loaders/` de proposito -
sao analises exploratorias, somente leitura, nao extractors de carga):

- `analisar_correlacao_mmgd_renda.py` - script principal. Metodologia: Spearman de
  ordem zero + Spearman parcial controlando renda (metodo residuo-de-postos: rankeia
  X, Y e controle(s), regride os postos de X e Y contra os postos do(s) controle(s)
  via OLS, correlaciona os residuos via Pearson - mesmo algoritmo usado por
  bibliotecas dedicadas como `pingouin.partial_corr(method='spearman')`,
  reimplementado aqui so com numpy/scipy). Testes de sensibilidade: estratificacao
  por regiao (5) e por tercil de urbanizacao (`percentual_populacao_rural`, 3
  faixas), mais controle conjunto renda+urbanizacao. NOVA DEPENDENCIA: `scipy`
  (rankdata/spearmanr/pearsonr) - ainda nao listada no CLAUDE.md "Bibliotecas em
  uso", instalar via `pip install scipy` no venv do projeto.
- `diagnosticar_outliers_regionais.py` - diagnostico dirigido (colinearidade
  regional renda x indicador, heterogeneidade por UF, top/bottom 10 municipios) para
  investigar casos especificos apontados pelo script principal.
- `inspecionar_colunas_mmgd_parquet.py` / `inspecionar_metadados_sidra_9928.py` -
  scripts de inspeccao pontual (nao fazem parte do pipeline, usados so para
  confirmar nomes reais de coluna/categoria antes de codificar contra suposicoes -
  mesmo cuidado ja documentado para o caso TSEE).

**MMGD sempre per capita, e separado por classe de consumo.** `mmgd_indicadores` so
grava o TOTAL agregado por municipio (sem classe de consumo) - a quebra por classe
(Residencial x Rural x Outras) vem direto do Parquet bruto da ANEEL
(`empreendimento-geracao-distribuida.parquet`, coluna `DscClasseConsumo`), lida em
tempo de analise, nao persistida no banco. Achado de qualidade de dado: 24.757 linhas
(~0,5%) tem `DscClasseConsumo = 'REBR'` (mais 2 residuais com espaco) - nao e classe
real da ANEEL, isoladas num grupo `NAO_CLASSIFICADO` a parte, fora dos totais. **A Y
PRINCIPAL da analise e a potencia MMGD RESIDENCIAL per capita** (nao o total) - e essa
a variavel que corresponde a "vazio de acesso" do DRF (acesso residencial), nao
instalacoes de agronegocio/irrigacao (classe "Rural" - proxy mais fino de irrigacao
nao existe neste arquivo da ANEEL, confirmado via metadado real).

**Resultado nacional (Y = potencia MMGD residencial per capita, controlando renda):**
robustos (sinal consistente nas 5 regioes + 3 faixas de urbanizacao + controle
conjunto): Cobertura de Investimento Habitacional (MCMV), % Cobertura CadUnico, %
Pobreza CadUnico, Taxa de Mortalidade Infantil, % Vinculos Formais (RAIS), %
Populacao Rural. Sensiveis (sinal muda em ao menos 1 regiao/faixa): IVS, Indice de
Precariedade de Infraestrutura, Indice de Precariedade Habitacional, Indice de
Seguranca da Posse, Taxa de Alfabetizacao, Irradiacao Solar.

**Achado metodologico principal: separar MMGD residencial de MMGD rural resolveu 3
dos 4 outliers regionais originais.** Antes da separacao por classe (usando MMGD
TOTAL como Y), o resumo de robustez mostrava Sul destoando das outras 4 regioes em
IVS, Indice de Precariedade de Infraestrutura e Indice de Seguranca da Posse, e
Centro-Oeste destoando isoladamente em Taxa de Mortalidade Infantil e Irradiacao
Solar. Investigacao (`diagnosticar_outliers_regionais.py`) mostrou que o topo do
ranking de MMGD per capita nessas regioes era dominado por pequenos municipios de
agronegocio (irrigacao) com bons indicadores sociais - misturados ao TOTAL, isso
distorcia a leitura regional. Ao trocar Y para APENAS MMGD residencial: IVS,
Precariedade de Infraestrutura e Mortalidade Infantil passaram a ter sinal
consistente nas 5 regioes (deixaram de ser outliers). Indice de Seguranca da Posse
(Sul) e Irradiacao Solar (Centro-Oeste) PERSISTIRAM mesmo so com MMGD residencial -
nao eram efeito de agronegocio/irrigacao.

**Hipotese de tipologia habitacional testada e NAO CONFIRMADA para os 2 casos
residuais.** Investigacao dos municipios concretos nos extremos do ranking (Sul:
periferia metropolitana de Curitiba - Piraquara, Almirante Tamandaray, Itaperucu,
Rio Branco do Sul; Centro-Oeste: cidades-dormitorio do Entorno do DF - Aguas Lindas
de Goias, Valparaiso de Goias, Cidade Ocidental, Novo Gama) sugeriu tipologia
habitacional densa (apartamento, sem telhado proprio individual) como confundidor
candidato. Adicionado `percentual_apartamento` (Tabela SIDRA 9928, classificacao 125
"Tipo de domicilio", categoria 3247 "Apartamento" / total 2932 - codigos confirmados
via metadado real da API, nao via documentacao) - migration `0016`, extractor
`extrair_tipo_domicilio_censo.py`. Resultado do teste direcionado (controlando
renda + % apartamento em vez de renda + urbanizacao):
- Sul x Seguranca da Posse: sinal continua destoando (+0,055 controlando apartamento
  vs +0,077 controlando urbanizacao - praticamente identico, hipotese nao explica).
- Centro-Oeste x Irradiacao Solar: sinal continua destoando (-0,454 controlando
  apartamento vs -0,506 controlando urbanizacao - tambem nao explica).

**Achado colateral notavel:** o sinal de `percentual_apartamento` em si saiu
CONTRARIO ao esperado - rho parcial (controlando renda) POSITIVO (+0,115 a +0,156
dependendo da variante de Y), nao negativo como a hipotese "apartamento = sem
telhado = menos MMGD" previa. Interpretacao: `percentual_apartamento` provavelmente
funciona mais como proxy de porte/modernidade urbana (cidades maiores/mais
desenvolvidas tem mais predios E mais adocao de solar por outros canais - consumidor
mais informado, mais instaladoras presentes, condominios com area comum apta a
placas) do que como medida limpa de "barreira de telhado proprio" - a variavel nao
isola o mecanismo que a hipotese original supunha.

**Conclusao desta sessao:** os 2 casos residuais (Seguranca da Posse/Sul,
Irradiacao Solar/Centro-Oeste) resistiram a 3 tentativas de explicacao
(colinearidade com renda, agronegocio/irrigacao, tipologia habitacional) - registrados
como NAO EXPLICADOS por enquanto, nao como erro de analise. Proximo candidato:
distribuidora/concessionaria por municipio (ver "Ideias para investigar" acima).

### Hipotese de distribuidora/concessionaria (sessao 06/07/2026, 4a tentativa)

**Achado metodologico:** nao foi preciso buscar fonte nova para municipio ->
distribuidora. O schema do INDQUAL (`qualidade_conjuntos`, ja carregado por
`etl_indqual.py`) grava `sig_agente` (sigla da distribuidora) por conjunto
eletrico, e `qualidade_conjunto_municipio` ja resolve conjunto<->municipio -
o mapeamento ja existia no banco como subproduto da carga de Qualidade de
Fornecimento. Script: `backend/src/etl/analises/investigar_distribuidora_
regioes_problema.py`. Achado de qualidade de dado: dos 5.573 municipios,
4.787 tem distribuidora unica e 753 tem MULTIPLAS distribuidoras (area de
concessao dividida entre agentes - comum no Sul, onde ha dezenas de
cooperativas de eletrificacao rural pequenas ao lado de RGE/RGE SUL/CELESC/
COPEL-DIS/CEEE-D).

**Centro-Oeste x Irradiacao Solar: hipotese CONFIRMADA (com ressalva de
confundimento com UF).** Os 10 municipios do fundo do ranking de MMGD
residencial per capita em todo o Centro-Oeste sao TODOS EQUATORIAL GO
(10/10) - Monte Alegre de Goias, Cavalcante, Sitio d'Abadia, Sao Joao
d'Alianca, Novo Gama, Nova Roma, Santa Rita do Novo Destino, Santo Antonio
do Descoberto, Santa Cruz de Goias, Aguas Lindas de Goias - apesar de
irradiacao SEMELHANTE OU MAIOR que a mediana da regiao (5,26 a 5,61
kWh/m2.dia). Mediana de MMGD residencial por distribuidora: EMS (MS) 352,
EMT (MT) 307, EQUATORIAL GO (GO) 167 - menos da metade de EMS/EMT, com
irradiacao mediana praticamente igual entre as 3 (4,97 a 5,28). Ou seja: em
Goias (EQUATORIAL GO), alto potencial fisico NAO se traduz em adocao -
padrao consistente com relatos publicos de fila/capacidade de conexao de
micro/minigeracao em distribuidoras do grupo Equatorial (Goias, Para,
Maranhao, Piaui, Alagoas). RESSALVA: EQUATORIAL GO cobre quase todo o
territorio de Goias, entao esta analise NAO separa limpo "efeito
distribuidora" de "efeito estado" (poderia ser outra politica estadual
especifica de Goias, nao necessariamente a distribuidora em si) - mas e uma
hipotese bem mais especifica e testavel do que "Centro-Oeste" como regiao,
e a proxima etapa natural seria investigar dados publicos de fila de conexao
de MMGD por distribuidora (se a ANEEL publicar isso).

**Sul x Seguranca da Posse: hipotese NAO CONFIRMADA - distribuidora nao
discrimina dentro do Sul.** COPEL-DIS aparece tanto no TOP 10 (Porto Rico
1.524,9 kW/1.000 hab, Itaipulandia 996,1) quanto no BOTTOM 10 (Itaperucu
18,9, Rio Branco do Sul 12,2, Cerro Azul 15,4, Guaraquecaba 12,6, Pinhao
21,7) do ranking de MMGD residencial - a MESMA distribuidora cobre os dois
extremos, entao a identidade da distribuidora nao explica a variacao dentro
do Sul (diferente do padrao limpo visto em Centro-Oeste). O padrao
geografico dentro de COPEL-DIS (periferia metropolitana de Curitiba com MMGD
baixo, municipios do interior/oeste do PR com MMGD alto) sugere que o que
importa e algo mais local que a distribuidora - talvez proximidade
metropolitana especifica, nao capturada por regiao, UF nem distribuidora.
Caso permanece NAO EXPLICADO apos 4 tentativas (colinearidade com renda,
agronegocio/irrigacao, tipologia habitacional, distribuidora).

### Teste quantitativo do mecanismo "fila de conexao" (sessao 06/07/2026)

A hipotese de distribuidora para Centro-Oeste (EQUATORIAL GO com MMGD
residencial muito abaixo de EMT/EMS apesar de irradiacao similar) tem
respaldo anedotico real: reportagem do Canal Solar ("Empresas apontam
atrasos na conexao de usinas em Goias", 02/07/2025) documenta relatos de
atraso >30 dias, falta de protocolo e descontinuacao da plataforma SICAP
(14/04/2025) pela Equatorial Goias. Para testar isso com numero, nao so
anedota, usado o dataset ANEEL "Atendimento a pedidos de conexoes MMGD -
pos Lei 14300" (`dadosabertos.aneel.gov.br/dataset/atendimento-mmgd-mini-e-
micro-geracao-distribuida`) - script `backend/src/etl/analises/
investigar_fila_conexao_mmgd_centro_oeste.py`.

**Achado 1 - identidade de agente confirmada via CNPJ:** as siglas deste
dataset ("Enel GO", "Energisa MT", "Energisa MS") NAO batem com as do INDQUAL
("EQUATORIAL GO", "EMT", "EMS") - confirmado via pesquisa externa (nao
suposicao) que sao as MESMAS empresas: a Enel vendeu sua distribuidora de
Goias (CNPJ 01.543.032/0001-04) para a Equatorial em 23/09/2022 (aprovado
ANEEL 06/12/2022), marca alterada para "Equatorial Energia Goias" em
30/12/2022 - mesma pessoa juridica, nome mudou. Este dataset usa o nome
ANTIGO ("Enel GO") mesmo cobrindo pedidos ja no periodo Equatorial - rotulo
do agente nao foi atualizado retroativamente na base da ANEEL.

**Achado 2 - cobertura real do dataset diverge da descricao oficial:** a
pagina do dataset descreve o periodo como "7/jan/2022 a 7/jan/2023" (recorte
de um Oficio Circular especifico), mas o intervalo REAL de `DatSolicitacao`
encontrado no arquivo e 14/06/2021 a 31/12/2024 - mais uma confirmacao da
regra ja estabelecida neste projeto (TSEE, tabelas SIDRA de aluguel): nunca
confiar na descricao textual de um dataset sem checar o dado real.

**Achado 3 - dado sentinela:** `DatInj` (data de conexao) tem 8.650
registros com valores implausiveis (ex.: 2099-12-31, placeholder de "nao
conectado" gravado como data em vez de nulo) - tratados como nao conectado
no calculo (nao como conexao real), efeito pequeno no resultado final
(~0,1% dos 6,3M registros).

**RESULTADO CONFIRMADO (apos corrigir dado sentinela): hipotese de
fila/atraso NAO CONFIRMADA pelos dados historicos 2021-2024 - Enel GO
(=Equatorial GO) teve desempenho IGUAL OU MELHOR que Energisa MT/MS neste
periodo, nao pior.** Resumo por distribuidora (pedidos Centro-Oeste
completo, n = total de pedidos, % dentro do prazo = entre os conectados):
- Enel GO: n=2.242.116, 94,9% conectado, 89,0% dentro do prazo, mediana
  -77 dias (antes do prazo)
- Energisa MT: n=1.949.648, 75,1% conectado, 95,2% dentro do prazo, mediana
  -95 dias
- Energisa MS: n=1.442.738, 77,5% conectado, 78,0% dentro do prazo, mediana
  -99 dias

Ou seja: Enel GO/Equatorial GO tem a MAIOR taxa de conclusao (94,9%) das
tres, e taxa de cumprimento de prazo entre os conectados (89,0%) melhor que
Energisa MS (78,0%) - o oposto do que a hipotese de "fila/atraso da
Equatorial" preveria. Reforca isso o detalhamento dos motivos de NAO conexao
(`DscMotivoSituacao`): Energisa MT tem 485.669 pedidos sem conexao (24,9% do
total), maioria por "Outras nao conformidades" (245.368) e "Perda de
validade" (43.634); Energisa MS tem 325.100 sem conexao (22,5%); Enel GO tem
so 105.024 sem conexao (4,7% do total, a MENOR proporcao das tres, maioria
sem motivo registrado). **Isso NAO contradiz necessariamente o relato do
Canal Solar** - a reportagem e de julho/2025 e descreve um problema iniciado
em abril/2025 (descontinuacao do SICAP), FORA da janela coberta por este
dataset (termina em dez/2024). Ou seja: o dado quantitativo disponivel hoje
cobre um periodo ANTERIOR ao problema relatado na imprensa - nao podemos
confirmar nem refutar o periodo recente (2025-2026) com esta fonte, so dizer
que 2021-2024 nao mostra Goias pior que MT/MS - pelo contrario.

**Conclusao sobre o caso Centro-Oeste x Irradiacao Solar apos 5 tentativas:**
o padrao geografico (Goias/EQUATORIAL GO sistematicamente abaixo de MT/MS em
MMGD residencial apesar de irradiacao similar) continua real e forte (ver
secao anterior), mas o MECANISMO especifico de "fila de conexao lenta" nao
tem respaldo nos dados historicos 2021-2024 disponiveis - pode ser um
fenomeno mais recente (2025+, fora do dataset atual), ou pode ser outro
mecanismo ainda nao testado (tarifa, comercializacao, marketing/presenca de
instaladoras, decisao de investimento da propria Equatorial em GD antes da
troca de controle societario). Registrado como parcialmente explicado
geograficamente, mecanismo causal ainda em aberto.

### Teste do mecanismo tarifa - TUSD+TE (sessao 06/07/2026, 5a tentativa)

Racional: a economia de instalar MMGD residencial e proporcional a tarifa total
(TUSD+TE) que o consumidor paga por kWh - tarifa mais baixa = payback mais
longo = menos incentivo a adotar. Testado via dataset ANEEL "Tarifas de
aplicacao das distribuidoras de energia eletrica" (atualizado semanalmente,
historico 2010-2026) - script `backend/src/etl/analises/
investigar_tarifa_centro_oeste.py`. Campos reais do CSV DIVERGEM do
dicionario oficial (novamente, mesmo cuidado do caso TSEE): `DscBaseTarifaria`
(nao `DscBaseTarifa`), `DscSubGrupo` (nao `DscSubgrupo`), `VlrTUSD`/`VlrTE`
(nao `VlrTusd`/`VlrTe`), `DscUnidadeTerciaria` (nao `DscUnidade`). Arquivo
tambem NAO e UTF-8 (e latin-1/cp1252) - mesmo tipo de achado ja visto no
INDQUAL.

**RESULTADO: hipotese de tarifa CONFIRMADA para o periodo relevante de
adocao (2010-2024), mas o padrao SE INVERTEU recentemente (2025-2026).**
Serie historica de tarifa total (TUSD+TE, R$/MWh, Residencial/Convencional/
Tarifa de Aplicacao) por ano:

| Ano | EMS | EMT | EQUATORIAL GO |
|---|---|---|---|
| 2010 | 353,0 | 349,2 | **305,9** |
| 2015 | 455,7 | 467,4 | **449,4** |
| 2020 | 595,2 | 600,1 | **512,5** |
| 2022 | 628,8 | 634,6 | **467,3** |
| 2024 | 681,6 | 651,6 | **548,0** |
| 2025 | 648,7 | 607,9 | 623,4 |
| 2026 (vigencia mais recente) | 510,7 | 423,7 | **613,0** |

EQUATORIAL GO (Goias) teve a tarifa MAIS BAIXA das 3 distribuidoras em TODOS
os 15 anos de 2010 a 2024, sem excecao - diferenca tipicamente de 80 a 160
R$/MWh abaixo de EMS/EMT. Isso cobre quase todo o periodo em que a adocao de
MMGD residencial cresceu no Brasil (2016-2024) - ou seja, para quem decidiu
instalar solar residencial em Goias nesses anos, o retorno financeiro
(economia por kWh gerado) era sistematicamente MENOR que para um morador
equivalente em MT ou MS. Isso e uma explicacao economica plausivel e
consistente para o estoque acumulado mais baixo de MMGD residencial em
Goias, independente de renda, urbanizacao, tipologia habitacional ou fila de
conexao (ja descartadas). **Achado notavel: o padrao se inverteu em
2025-2026** - a tarifa vigente mais recente da EQUATORIAL GO (613,0,
vigencia 01/01/2026) ja supera a de EMT (423,7, vigencia 08/04/2026) e fica
proxima da EMS (510,7, vigencia 22/04/2026). Se a hipotese de tarifa estiver
certa, o incentivo economico para MMGD residencial em Goias deveria estar
MELHORANDO relativamente a MT/MS agora - efeito so deve aparecer no estoque
de MMGD em sessoes/anos futuros, nao no snapshot atual (que reflete decisoes
tomadas majoritariamente sob as tarifas mais baixas do periodo 2010-2024).

RESSALVA DE QUALIDADE DE DADO: EMT apareceu com `VlrTE` NEGATIVO (-37,53) na
vigencia mais recente (08/04/2026) - nao investigado a fundo se e um credito/
subsidio tarifario real (plausivel, ANEEL as vezes zera ou credita parcela
de TE em certas composicoes) ou uma inconsistencia da fonte; nao afeta a
soma total nem a conclusao principal (serie 2010-2024), mas vale nota se
este dado for usado para outro proposito no futuro.

**Conclusao do caso Centro-Oeste x Irradiacao Solar apos 5 tentativas:**
diferente do padrao geografico (que so aponta "e Goias"), agora ha um
mecanismo economico CONCRETO e quantificado (tarifa historica mais baixa)
consistente com a adocao residencial mais baixa observada no estoque atual
de MMGD. Registrado como PARCIALMENTE EXPLICADO por mecanismo (nao so
geografia) - ressalva de que e correlacao historica robusta, nao
experimento controlado, e que o padrao de tarifa mudou muito recentemente
(2025-2026), o que sera importante observar em cruzamentos futuros.

### Extensao do teste de tarifa para todas as distribuidoras + correlacao nacional (sessao 06/07/2026)

A pedido do usuario, o achado descritivo acima (limitado a 3 distribuidoras
do Centro-Oeste) foi generalizado para TODO o Brasil e testado
estatisticamente pelo metodo Spearman/parcial ja padrao do projeto.

**Extractor nacional:** `backend/src/etl/loaders/extrair_tarifa_distribuidoras.py`
+ migration `0018_indicadores_sociais_tarifa_residencial.sql` (coluna
`tarifa_energia_residencial` em `indicadores_sociais`, exposta na view
`vw_indicadores_sociais_consolidado`). Reaproveita a mesma logica de
resolucao municipio -> distribuidora via `sig_agente` (INDQUAL) ja usada nas
investigacoes anteriores desta secao. Roda contra as 116 distribuidoras
distintas encontradas no CSV completo de tarifas (nao so as 3 do
Centro-Oeste). Resultado da carga: 4.724/5.540 municipios receberam tarifa
(753 excluidos por area de concessao dividida - multiplas distribuidoras -,
63 sem tarifa homologada no periodo filtrado); media nacional 557,50 R$/MWh,
mediana 508,49 R$/MWh.

**Integracao no pipeline de correlacao:** `tarifa_energia_residencial`
adicionada a `VARIAVEIS_X` e a query de
`analisar_correlacao_mmgd_renda.py`, com sentido anotado como AMBIGUO (nao
e vulnerabilidade - e incentivo economico esperado positivo para MMGD).

**RESULTADO NACIONAL: tarifa NAO e um preditor nacional robusto de adocao de
MMGD residencial.** Para Y = potencia MMGD residencial per capita (variavel
principal do pipeline): rho bruto = 0,0012 (p=0,934, NAO significativo);
parcial controlando renda = -0,0073 (p=0,615, NAO significativo); parcial
controlando renda+urbanizacao conjuntamente = +0,0725 (p<0,0001,
estatisticamente significativo mas com magnitude muito pequena e sinal
instavel). No resumo de robustez por regiao/urbanizacao, o indicador ficou
classificado como "sensivel - sinal muda/inverte" (2/5 regioes com mesmo
sinal, 0/3 faixas de urbanizacao com mesmo sinal) - o pior resultado de
consistencia entre todos os 14 indicadores testados nesta rodada.

**MAS o efeito e fortemente concentrado no Centro-Oeste - exatamente onde a
hipotese foi originalmente formulada.** Sensibilidade regional (parcial
controlando renda, Y = potencia MMGD residencial per capita):

| Regiao | rho parcial (renda) |
|---|---|
| Centro-Oeste | **+0,466** |
| Norte | +0,217 |
| Sul | +0,077 |
| Nordeste | -0,018 |
| Sudeste | -0,034 |

Centro-Oeste destaca-se com folga como a regiao onde tarifa mais alta se
associa a mais MMGD residencial (controlando renda) - consistente com o
mecanismo descritivo ja documentado (EQUATORIAL GO com tarifa
sistematicamente mais baixa 2010-2024). Nas demais regioes o efeito e fraco,
nulo ou nao significativo.

**Conclusao (integra e refina a conclusao da secao anterior):** a hipotese
de tarifa NAO se sustenta como driver geral de MMGD no Brasil, mas SUSTENTA-SE
como mecanismo regional especifico do Centro-Oeste - o que e coerente com a
motivacao original do teste (explicar por que Centro-Oeste destoa do padrao
nacional de Irradiacao Solar) e nao um resultado nacional generico. Tratar
`tarifa_energia_residencial` como variavel de interesse regional
(Centro-Oeste), nao como indicador nacional robusto de vulnerabilidade/
incentivo a incluir em rankings compostos nacionais.

### Ideia de produto: ranking publico de distribuidoras por desempenho em conexao de MMGD

Levantada pelo usuario a partir do achado acima (sessao 06/07/2026): o
dataset ANEEL "Atendimento a pedidos de conexoes MMGD" permite construir,
por distribuidora, metricas objetivas e comparaveis de desempenho no
atendimento a pedidos de conexao (% de pedidos conectados, % dentro do
prazo regulatorio, mediana de dias de atraso/folga) - ver metodologia em
`investigar_fila_conexao_mmgd_centro_oeste.py`. Hipotese de produto: um
ranking/painel publico comparando distribuidoras nesses criterios seria
util para o setor de energia solar (integradoras decidem onde vale a pena
investir/anunciar, consumidores sabem o que esperar da sua distribuidora) e
poderia ser um diferencial de adocao do Atlas Solar Justo fora do escopo
original de justica energetica. NAO PRIORIZADO ainda - precisa: (1) baixar
e processar as 5 regioes (hoje so Centro-Oeste foi baixado/testado), (2)
decidir se o ranking fica so no eixo tecnico (prazo/conexao) ou tambem
incorpora justica energetica (cruzar com indicadores sociais dos municipios
atendidos por cada distribuidora), (3) decidir granularidade de exibicao
(nacional por distribuidora? por UF?). Registrado como ideia de produto, nao
como item da fila de dados.


## Manutencao deste documento

Atualizar ao fim de cada sessao de carga de dados: estado da `unidades_espaciais`,
tabela de dimensoes e fila de trabalho. Decisoes de fontes so mudam com nova pesquisa.
