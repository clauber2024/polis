# ARQUITETURA.md — Estado Atual e Decisões de Dados
> Complemento ao [`CLAUDE.md`](./CLAUDE.md) (padroes tecnicos) e ao [`README.md`](./README.md).
> Este documento cobre o que muda com frequencia: estado dos dados, decisoes de fontes
> e fila de trabalho. Padroes de codigo, banco e Git estao no CLAUDE.md - nao duplicar aqui.
> Ultima atualizacao: 09/07/2026.

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

1. Cruzamento MMGD x indicadores sociais - **CONCLUIDO (rotulo "EM ANDAMENTO"
   corrigido em 08/07/2026 - a pendencia de robustez por regiao/urbanizacao
   foi encerrada em 07/07/2026, ver abaixo "Com isso, a pendencia de
   06/07/2026 esta encerrada"; os itens 3-6 desta mesma fila - Vazios de
   Acesso e Grupo Equatorial no Nordeste - tambem estao todos executados ou
   formalmente encerrados). O trabalho pendente de OUTRA natureza -
   reimplementar a logica de classificacao de Vazio de Acesso como rota/
   endpoint real no backend Node/Express - foi FEITO em 07/07/2026:
   `GET /api/vazios-de-acesso` (`backend/src/services/vaziosDeAcesso.service.ts`),
   ver "Backend Node/Express" em CLAUDE.md, secao "Estado Real do Projeto",
   para os detalhes (inclui o bloqueio real encontrado - MMGD residencial nao
   estava persistido no banco - e a decisao de expandir `extrair_mmgd_aneel.py`
   + migration 0020 para resolver, em vez do endpoint usar MMGD total com
   divergencia). `identificar_vazios_de_acesso.py` continua existindo como
   protótipo de validação (nao remover) - o endpoint é a implementação final,
   nao substitui o script como documentação da metodologia.** (ver secao "Analise de
   correlacao MMGD x Indicadores Sociais" abaixo, sessao 06/07/2026). Metodologia
   (Spearman + parcial controlando renda + sensibilidade regiao/urbanizacao) esta
   pronta e reutilizavel. Irradiacao Solar no Centro-Oeste: parcialmente explicado
   (tarifa historica 2010-2024, ver secao propria) - mecanismo de fila de conexao
   descartado, mecanismo de tarifa confirmado regionalmente. **Seguranca da Posse no
   Sul: caso ENCERRADO por decisao do usuario (sessao 06/07/2026) apos 6 tentativas de
   explicacao descartadas (renda, agronegocio/irrigacao, tipologia habitacional,
   distribuidora, validade de constructo rural/urbano, regularizacao fundiaria/
   ambiental) - ver secao "Caso Sul x Seguranca da Posse encerrado" abaixo. NAO
   retomar sem fonte/evidencia nova que justifique reabrir.** **Grupo
   Equatorial x Vazio de Acesso no Nordeste: caso tambem ENCERRADO por decisao
   do usuario (sessao 06/07/2026) apos 3 mecanismos testados (renda
   enfraquecida, tarifa rejeitada na direcao oposta, fila de conexao
   inconclusiva por bloqueio de dado) - ver itens 4-6 abaixo. NAO retomar sem
   fonte/evidencia nova.**

   **PENDENCIA REAL para retomar este item (identificada em 06/07/2026,
   ainda NAO investigada): a tabela de robustez nacional ("Analise de
   correlacao MMGD x Indicadores Sociais" abaixo) classifica 6 indicadores
   como "sensivel" (sinal muda entre regioes/faixas de urbanizacao) - IVS,
   Indice de Precariedade de Infraestrutura, Indice de Precariedade
   Habitacional, Indice de Seguranca da Posse, Taxa de Alfabetizacao,
   Irradiacao Solar. Só 2 desses 6 (Seguranca da Posse/Sul, Irradiacao
   Solar/Centro-Oeste) receberam investigacao dedicada de qual regiao causa
   a instabilidade e por que (ambos ja encerrados/explicados, ver acima).
   **Indice de Precariedade Habitacional e Taxa de Alfabetizacao NUNCA
   tiveram esse mesmo tratamento** - permanecem so como "sensivel" na
   tabela agregada, sem saber se ha uma unica regiao/estado dirigindo a
   inconsistencia (como Sul e Centro-Oeste dirigiam os outros 2 casos) ou
   se e ruido espalhado sem padrao.

   **RESSALVA IMPORTANTE (verificado em 06/07/2026): `diagnosticar_
   outliers_regionais.py` NAO pode ser rodado direto para isso - esta
   hardcoded para a analise ANTIGA** (`COLUNA_Y =
   "mmgd_potencia_per_1000_hab"`, TOTAL, nao residencial; e
   `REGIOES_INDICADORES_FOCO` fixo em Sul=[ivs, indice_seguranca_posse,
   indice_precariedade_infraestrutura, taxa_alfabetizacao] e
   Centro-Oeste=[taxa_mortalidade_infantil, irradiacao_media_kwh_m2_dia] -
   a lista de ANTES da correcao Residencial x Rural que resolveu IVS/
   Infraestrutura/Mortalidade Infantil, ver "Analise de correlacao MMGD x
   Indicadores Sociais" abaixo). PASSO A PASSO CORRETO para retomar:
   1. Rodar `analisar_correlacao_mmgd_renda.py` (o script principal, ja usa
      Y residencial por padrao) e olhar o resumo de robustez por regiao/
      urbanizacao especificamente para `indice_precariedade_moradia` e
      `taxa_alfabetizacao` - identificar QUAL regiao(oes) causa(m) a
      inversao de sinal hoje (pode nao ser mais Sul, a lista antiga pode
      estar desatualizada).
   2. So depois de saber a regiao certa, atualizar `COLUNA_Y` para
      `mmgd_potencia_residencial_per_1000_hab` e `REGIOES_INDICADORES_FOCO`
      em `diagnosticar_outliers_regionais.py` (ou copiar para um script
      novo, mesmo padrao ja usado varias vezes nesta linha de
      investigacao) antes de rodar o diagnostico de 3 lentes.
   3. Alternativa mais simples: decidir de saida que o esforco adicional
      nao compensa (mesmo raciocinio ja aplicado ao caso Sul apos 6
      tentativas) e marcar os 2 indicadores como "sensivel, sem
      investigacao dedicada, por decisao explicita" para fechar de vez o
      item 1.**

   **PENDENCIA RESOLVIDA (sessao 07/07/2026) - os 2 indicadores acima
   (Precariedade Habitacional, Taxa de Alfabetizacao) receberam diagnostico
   dedicado e ambos foram EXPLICADOS (nao apenas fechados por decisao, como
   o caso Sul):**

   - **Indice de Precariedade Habitacional x Centro-Oeste** - script
     `backend/src/etl/analises/investigar_precariedade_habitacional_centro_oeste.py`
     (3 lentes, mesmo padrao do diagnostico Sul/Centro-Oeste anterior, mas Y
     residencial e foco isolado no par certo). Resultado: rho parcial no
     Centro-Oeste = +0,006 (praticamente zero) contra -0,15 a -0,28 nas
     outras 4 regioes. Causa identificada: o indicador esta no PISO em toda
     a regiao simultaneamente - mediana por UF de 0,01 (MS), 0,02 (MT), 0,01
     (GO), 0,06 (DF), numa escala 0-1 - sem variancia suficiente para
     produzir uma correlacao estavel (restricao de variancia/"range
     restriction"), nao um efeito social diferente. Top/bottom 10 municipios
     do Centro-Oeste por MMGD residencial confirmam: indice igualmente perto
     de zero nos dois extremos, sem padrao. Colinearidade renda-indicador
     tambem mais forte dentro da regiao (+0,256 vs +0,074 nacional),
     reforcando que o "controle por renda" opera sobre uma faixa estreita e
     ruidosa ali. **CONCLUSAO: caso explicado - restricao de variancia
     regional, nao anomalia social real. Fechado, nao precisa nova
     investigacao salvo se o indicador ganhar mais variancia no Centro-Oeste
     em atualizacao futura dos dados de origem.**
   - **Taxa de Alfabetizacao x tercil "Mais urbanizados"** - script
     `backend/src/etl/analises/investigar_alfabetizacao_urbanizacao.py`.
     Achado inicial importante: a divergencia NAO e regional (5/5 regioes
     concordam em sinal com o nacional) - e o tercil de urbanizacao "Mais
     urbanizados (menor % rural)" que inverte (rho parcial = -0,076 contra
     +0,35/+0,41 nos outros 2 tercis). Diagnostico revelou 2 candidatos
     concorrentes: (a) colinearidade renda-alfabetizacao mais forte dentro
     do tercil (+0,496 vs +0,344 nacional); (b) composicao regional
     desbalanceada dentro do tercil - Sudeste e 49% da amostra (n=905,
     alfabetizacao mediana 95,0, MMGD moderado/baixo 130,96), Centro-Oeste
     so 11% (n=199, MMGD bem maior 277,59, alfabetizacao levemente menor
     92,77); os 10 piores municipios do tercil por MMGD residencial sao
     dominados por metropole densa do ABC/litoral paulista (Diadema, Taboao
     da Serra, Sao Vicente, Santos, Cubatao, Maua - alfabetizacao 95-98%,
     MMGD 6-10 kW/1.000 hab) mais 3 municipios ribeirinhos do Norte
     (Amazonas/Para - isolamento, nao densidade - MMGD 1-3 kW/1.000 hab,
     alfabetizacao 90-94%). Teste direcionado controlando renda +
     `percentual_apartamento` (em vez de so renda, reaproveitando o
     mecanismo de tipologia habitacional ja confirmado noutro caso do
     projeto): sinal dentro do tercil vai de -0,0765 (so renda) para +0,0462
     (renda+apartamento), **passando a CONCORDAR com o nacional (+0,3468)**.
     **CONCLUSAO: tipologia habitacional (moradia densa/apartamento, sem
     telhado proprio) EXPLICA a inversao de sinal - confirmado
     quantitativamente, mesmo mecanismo ja validado no projeto.** RESSALVA:
     magnitude pos-controle ainda pequena (+0,046 vs +0,35 nacional) -
     apartamento explica a MUDANCA DE SINAL, nao restaura a forca total da
     correlacao; os 3 municipios ribeirinhos do Norte na lista de piores
     nao sao apartamento-denso (isolamento/infraestrutura de rede, nao
     tipologia habitacional, provavelmente um segundo mecanismo residual
     sobreposto). Nao investigar esse residuo especifico a menos que surja
     evidencia nova - mesmo criterio de nao perseguir hipoteses ad-hoc
     indefinidamente ja aplicado aos casos Sul e Equatorial/Nordeste.

   **Com isso, a pendencia de 06/07/2026 esta encerrada**: dos 6 indicadores
   originalmente classificados como "sensivel" na tabela de robustez
   nacional (IVS, Precariedade de Infraestrutura, Precariedade Habitacional,
   Seguranca da Posse, Taxa de Alfabetizacao, Irradiacao Solar), os 4 casos
   que motivaram investigacao dedicada isolada (Seguranca da Posse/Sul,
   Irradiacao Solar/Centro-Oeste, Precariedade Habitacional/Centro-Oeste,
   Alfabetizacao/urbanizacao) tem todos diagnostico ou decisao de
   encerramento registrados. IVS e Precariedade de Infraestrutura seguem
   sem diagnostico isolado proprio, mas ja foram tocados indiretamente pelo
   pacote de 3 lentes do caso Sul (`diagnosticar_outliers_regionais.py`) -
   nao abrir nova linha de investigacao para eles sem motivo especifico.
2. ~~Atualizar README e CLAUDE.md (Estado Real) com os dados das sessoes de Moradia,
   INDQUAL, DEC/FEC real, Capital Humano e Irradiacao Solar~~ - FEITO (sessao
   06/07/2026): CLAUDE.md ja estava majoritariamente atualizado (verificado, incluia
   migrations 0014-0018 e os 8 eixos do DRF); adicionado so o script novo
   `investigar_construto_posse_rural_sul.py` na estrutura da secao 2. README.md
   estava desatualizado (datado 04/07/2026, sem IVS Consolidado, RDPC, tarifa
   residencial, % apartamento, CadUnico, e sem os extractors/scripts de analise mais
   recentes) - atualizada a tabela "Estado atual dos dados", a tabela de fontes
   primarias, e a lista de comandos em "Como rodar localmente".
3. **Identificacao e ranking de "Vazios de Acesso" (RF-055, RF-056, RF-057) - NOVO,
   sessao 06/07/2026.** O item 1 (cruzamento MMGD x indicadores) produziu testes de
   robustez e diagnostico de outliers, mas nunca gerou o produto que o DRF pede: lista
   concreta de municipios classificados como "Vazio de Acesso" (alto potencial solar,
   baixo MMGD). Script criado:
   `backend/src/etl/analises/identificar_vazios_de_acesso.py` - classifica todos os
   municipios em 4 quadrantes (mediana nacional de irradiacao solar x MMGD residencial
   per capita, mesma metodologia ja decidida em "Indices compostos e metodologia de
   cruzamentos"), prioriza os Vazios de Acesso por IVS (RF-056), e exporta CSV
   completo. **PROTOTIPO DE VALIDACAO, nao a implementacao final** - a logica de
   quadrante deve ser reimplementada no backend Node/Express quando ele existir (ja
   documentado como decisao anterior).

   **REIMPLEMENTADO no backend em 07/07/2026**: `GET /api/vazios-de-acesso`
   (`backend/src/services/vaziosDeAcesso.service.ts`) - mesma metodologia (mediana
   nacional, priorizacao por IVS), com filtros uf/regiao/quadrante, ordenacao e
   paginacao via query params, e a ressalva metodologica abaixo embutida na resposta
   da API (campo `notaMetodologica`). Requereu migration 0020 (persistir MMGD
   residencial em `mmgd_indicadores`, antes so calculavel lendo o Parquet bruto em
   Python) - ver CLAUDE.md, "Estado Real do Projeto", para o detalhe do bloqueio e
   da decisao.

   **RESULTADO (executado 06/07/2026):** mediana nacional - potencial solar 5,015
   kWh/m2.dia, MMGD residencial per capita 111,29 kW/1.000 hab. 1.451 municipios
   (26,1% dos 5.569 classificaveis) sao VAZIO DE ACESSO (alto potencial, baixo MMGD).

   **Achado principal: o vazio de acesso e extremamente concentrado no Nordeste.**
   1.123 dos 1.451 vazios de acesso (77,4% do total nacional) estao no Nordeste, e
   62,6% de TODOS os municipios do Nordeste sao vazio de acesso - de longe a maior
   proporcao regional (Sudeste 13,8%, Centro-Oeste 13,3%, Norte 8,0%). O top 20 do
   ranking por vulnerabilidade (IVS, do pior para o melhor) e quase todo Nordeste
   (MA, AL, PB, PI, BA, PE) - IVS entre 0,68 e 0,76 (proximo do pior extremo
   nacional, distribuicao vai de 0,09 a 0,78), renda media domiciliar entre R$
   2.000 e R$ 3.400, % pobreza CadUnico entre 55% e 79%. RESSALVA
   METODOLOGICA: esta classificacao e um corte bivariado simples (so
   irradiacao x MMGD, sem controlar renda) - a analise de correlacao ja
   mostrou que renda e o preditor mais robusto de MMGD nacionalmente, entao
   parte dessa concentracao no Nordeste reflete o proprio gargalo de renda
   documentado alhures, nao um efeito "puro" de potencial solar desperdicado.
   Isso nao invalida o resultado para fins de RF-055/056 (o requisito pede
   justamente esse corte simples, potencial x acesso), mas deve ser
   comunicado como nota metodologica na exibicao (RF-080 ja preve nota
   metodologica para o Indice de Pobreza Energetica Regional - vale o mesmo
   cuidado aqui).

   **Achado secundario: Sul tem ZERO vazios de acesso (0,0%)** - 857 dos 1.191
   municipios do Sul (71,9%) caem em "Adocao acima do potencial" (baixo
   potencial solar, alto MMGD) - o Sul supera sistematicamente o que seu
   potencial fisico sozinho preveria, consistente com os achados ja
   documentados de forte cultura cooperativista (Sicredi/Sicoob) e renda/
   vinculos formais mais altos.

   Arquivo `vazios_de_acesso_municipios.csv` gerado localmente (todos os
   5.569 municipios classificados, nao versionado - dado derivado,
   reproduzivel a partir do banco).

4. **Grupo Equatorial explica a concentracao de Vazios de Acesso no Nordeste?
   - sessao 06/07/2026, EXECUTADO.** Motivacao: a hipotese de
   distribuidora ja CONFIRMOU (secao "Hipotese de distribuidora/concessionaria")
   que EQUATORIAL GO tem MMGD residencial per capita menos da metade de EMS/EMT
   no Centro-Oeste apesar de irradiacao semelhante. O grupo Equatorial tambem
   opera distribuidoras em Maranhao, Piaui e Alagoas - 3 dos estados que mais
   aparecem no topo do ranking de Vazio de Acesso (item 3 acima). Script criado:
   `backend/src/etl/analises/investigar_distribuidora_vazios_nordeste.py` -
   reaproveita o mapeamento municipio->distribuidora do INDQUAL (ja usado na
   hipotese de distribuidora) e a classificacao de quadrante de
   `identificar_vazios_de_acesso.py`, compara taxa de Vazio de Acesso e MMGD
   residencial mediano por distribuidora dentro do Nordeste, com destaque
   separado para distribuidoras com "EQUATORIAL" no nome. RESSALVA JA
   INCORPORADA NO SCRIPT: mesmo que o padrao geografico se confirme, o
   MECANISMO (fila de conexao vs. tarifa) precisaria do mesmo teste
   quantitativo ja feito para Centro-Oeste - la, fila de conexao NAO se
   sustentou nos dados 2021-2024 (foi tarifa historica que explicou).

   **RESULTADO (executado 06/07/2026):** Y usado
   `mmgd_potencia_residencial_per_1000_hab` (mediana nacional 111,29 kW/1.000
   hab, consistente com item 3). Agregado Nordeste, Grupo Equatorial (MA+PI+AL,
   n=543) vs. demais distribuidoras (n=1.251): **Equatorial tem MMGD residencial
   mediano PIOR** (69,86 vs. 79,14 kW/1.000 hab) e **% Vazio de Acesso PIOR**
   (70,2% vs. 59,3%), apesar de potencial solar mediano praticamente IDENTICO
   (5,455 vs. 5,477 kWh/m2.dia) e de renda mediana domiciliar MAIOR no grupo
   Equatorial (R$ 2.898 vs. R$ 2.722) - isto e, Equatorial performa pior mesmo
   partindo de uma base de renda mais favoravel, o que enfraquece "renda"
   como explicacao alternativa para esta comparacao especifica e fortalece o
   padrao ja visto em EQUATORIAL GO (Centro-Oeste): mesmo potencial solar,
   adocao MMGD sistematicamente mais baixa.

   RESSALVA a partir do corte por distribuidora individual (n>=5 municipios):
   o padrao NAO e uniforme dentro do grupo Equatorial nem exclusivo dele. As
   duas piores distribuidoras isoladas do Nordeste sao NAO-Equatorial (SULGIPE,
   100% vazio, MMGD 28,6; EPB, 83,3% vazio, MMGD 45,9) - piores que qualquer
   distribuidora Equatorial individualmente (EQUATORIAL MA 64,5%/50,7;
   EQUATORIAL AL 80,2%/68,8; EQUATORIAL PI 71,9%/80,9). Do lado oposto, COSERN
   (RN, nao-Equatorial) tem o MELHOR desempenho de longe (28,5% vazio, MMGD
   157,7) com o MAIOR potencial solar do grupo (5,77) - mediana puxada por bons
   desempenhos fora da Equatorial, nao so por maus desempenhos dentro dela.
   Ou seja: o efeito agregado Equatorial-pior e real nos dados, mas e mais
   fraco/mais heterogeneo que o caso EQUATORIAL GO no Centro-Oeste (que era
   quase um caso isolado e limpo).

   **Conclusao:** padrao geografico PARCIALMENTE confirmado (agregado
   Equatorial pior que a media, controlando visualmente por potencial solar e
   renda) mas MAIS FRACO e menos uniforme que Centro-Oeste. MECANISMO CAUSAL
   AINDA NAO TESTADO - proximo passo, se a fila de trabalho priorizar isto, e
   repetir para Equatorial MA/PI/AL o mesmo teste quantitativo de tarifa
   historica ja feito para Centro-Oeste (onde fila de conexao foi descartada e
   tarifa confirmada) antes de declarar causa. Nao presumir que o mesmo
   mecanismo (tarifa) se repete so pela coincidencia de grupo economico.

5. **Teste do mecanismo tarifa (TUSD+TE) para Equatorial no Nordeste -
   sessao 06/07/2026, EXECUTADO.** Continuacao direta do item 4: repete para o
   Nordeste o mesmo teste que confirmou tarifa como mecanismo regional no
   Centro-Oeste (ver "Teste do mecanismo tarifa - TUSD+TE" abaixo). Script:
   `backend/src/etl/analises/investigar_tarifa_nordeste_equatorial.py` -
   compara serie historica de tarifa total (TUSD+TE, Residencial/Convencional/
   Tarifa de Aplicacao) entre EQUATORIAL MA/PI/AL e as demais distribuidoras do
   Nordeste (COSERN, COELBA, EPB, ENEL CE, Neoenergia PE, ESE, SULGIPE).
   Nomes antigos pre-aquisicao (CEMAR/CEPISA/CEAL) NAO apareceram no arquivo -
   as 3 distribuidoras Equatorial ja constam com o nome atual desde 2010,
   diferente do caso Centro-Oeste (onde "Enel GO" era o nome usado no dataset
   de conexoes ate 2024).

   **RESULTADO: hipotese de tarifa REJEITADA para o Nordeste - direcao OPOSTA
   a do Centro-Oeste.** Media historica de tarifa total (TUSD+TE, R$/MWh,
   2010-2024, mesma janela usada no veredito do Centro-Oeste), do menor para o
   maior:

   | Distribuidora | Media 2010-2024 (R$/MWh) |
   |---|---|
   | EPB | 437,6 |
   | COSERN | 441,3 |
   | ESE | 450,2 |
   | Neoenergia PE | 469,1 |
   | ENEL CE | 481,3 |
   | COELBA | 492,4 |
   | SULGIPE | 499,3 |
   | EQUATORIAL AL | 506,9 |
   | EQUATORIAL MA | 509,8 |
   | **EQUATORIAL PI** | **528,9** |

   As 3 distribuidoras Equatorial (AL, MA, PI) tem as tarifas MAIS ALTAS das
   10 comparadas no periodo 2010-2024, nao as mais baixas - o oposto do que a
   hipotese de tarifa preveria (tarifa mais baixa -> menos incentivo -> menos
   MMGD, como confirmado para EQUATORIAL GO no Centro-Oeste). Se a economia da
   tarifa fosse o mecanismo, o Equatorial nordestino deveria ter MAIS adocao
   residencial que a media da regiao, nao menos - o oposto do observado no
   item 4 (MMGD residencial mediano PIOR no grupo Equatorial). **Isso
   CONFIRMA o alerta previo do teste nacional por regiao** (rho parcial/renda
   Nordeste = -0,018, praticamente nulo e sinal errado vs. +0,466 no
   Centro-Oeste) com um teste especifico e descritivo, na mesma metodologia
   que validou o caso Centro-Oeste.

   **Conclusao:** tarifa NAO explica o padrao Equatorial no Nordeste - ao
   contrario, torna-o mais intrigante (adocao mais baixa APESAR de tarifa mais
   alta, que deveria incentivar mais, nao menos). O mecanismo de fila de
   conexao (unico ainda nao testado para esta regiao - ver "Teste quantitativo
   do mecanismo 'fila de conexao'" abaixo, feito ate agora so para
   Centro-Oeste) e o proximo candidato natural, mas requer baixar o dataset
   ANEEL de atendimento a pedidos de conexao MMGD especificamente para os
   estados MA/PI/AL (nao baixado ainda). Registrado como MECANISMO AINDA NAO
   IDENTIFICADO para o Nordeste - padrao geografico do item 4 continua real,
   mas nem tarifa nem (por enquanto) qualquer outra causa concreta foi
   confirmada.

6. **Teste do mecanismo fila de conexao para Equatorial no Nordeste - NOVO,
   sessao 06/07/2026, script criado, ainda NAO EXECUTADO.** Ultimo mecanismo ja
   cotado (ver "Hipotese de distribuidora/concessionaria") ainda sem teste
   quantitativo para esta regiao - renda e tarifa ja descartados (itens 4/5).
   Script criado: `backend/src/etl/analises/
   investigar_fila_conexao_mmgd_nordeste.py` - mesmo dataset ANEEL do
   Centro-Oeste ("Atendimento a pedidos de conexoes MMGD - pos Lei 14300"),
   mas usando o recurso especifico da regiao Nordeste (arquivo separado por
   regiao no portal - URL confirmada via pagina do dataset, nao suposta a
   partir do padrao do Centro-Oeste). Compara % conectado e % dentro do prazo
   regulatorio entre EQUATORIAL MA/PI/AL e as demais distribuidoras
   (COSERN, COELBA, EPB, ENEL CE, Neoenergia PE, ESE, SULGIPE). Requer NOVO
   DOWNLOAD (arquivo regional do Nordeste, nao baixado ainda - diferente do
   dataset de tarifas do item 5, que ja existia localmente do teste do
   Centro-Oeste).

   NOTA JA REGISTRADA NO PROPRIO SCRIPT: se este teste tambem vier negativo,
   os 3 mecanismos ja cotados (renda, tarifa, fila de conexao) terao sido
   descartados para o Nordeste - decisao sugerida (a confirmar com o usuario
   na hora) e encerrar o caso sem mecanismo identificado, mesmo tratamento
   dado ao caso "Sul x Seguranca da Posse" (ver secao propria), em vez de
   continuar testando hipoteses ad-hoc indefinidamente.

   **RESULTADO (executado 06/07/2026): INCONCLUSIVO por bloqueio de dado -
   campo DatLim (prazo regulatorio) esta praticamente AUSENTE para o Grupo
   Equatorial no dataset.** % de pedidos conectados com DatLim de fato
   preenchida (`pct_datlim_presente_entre_conectados`, checagem adicionada
   apos a 1a rodada mostrar 0,0%/0,1% de "dentro do prazo" - extremo demais
   pra ser confiado sem checar):
   - EQUATORIAL MA: 0,0% | EQUATORIAL PI: 0,1% | EQUATORIAL AL: 0,0% |
     Energisa Borborema (fora do grupo, mas mesmo padrao): 0,0%
   - Todas as demais distribuidoras do Nordeste: 86,7% a 100,0%

   Ou seja, os numeros de "% dentro do prazo" e "mediana de dias de atraso"
   NAO refletem desempenho real da Equatorial - refletem um campo que a
   ANEEL simplesmente nao recebeu/registrou para essas distribuidoras neste
   dataset. Mesmo tipo de armadilha de dado ja visto antes neste projeto
   (sentinela DatInj 2099-12-31 no Centro-Oeste, campos de metadado errados
   no INDQUAL/TSEE) - identificado e neutralizado antes de virar conclusao
   falsa.

   **Metrica alternativa que NAO depende de DatLim** (`pct_conectado` - taxa
   de conclusao do pedido, independente de prazo): EQUATORIAL MA 79,7%,
   EQUATORIAL PI 83,2% - ambas ACIMA da mediana do grupo comparado; EQUATORIAL
   AL 68,9% - abaixo da mediana mas empatada com COELBA (68,3%) e Energisa PB
   (70,5%), longe do pior caso (Sulgipe, 50,6%). Motivo de nao-conexao mais
   comum para o Grupo Equatorial e "Documentacao incompleta" (48-64% dos nao
   conectados) + "Desistencia do consumidor" (~25%) - padrao diferente do
   resto da regiao (onde "Outras nao conformidades" domina em Coelba/Cosern/
   Neoenergia PE/Sulgipe), mas nao interpretavel diretamente como capacidade
   administrativa pior (pode refletir perfil de cliente/regiao, nao
   distribuidora).

   **Conclusao:** fila de conexao NAO PODE ser testada de forma conclusiva
   para o Grupo Equatorial no Nordeste com este dataset (bloqueio de dado, nao
   ausencia de efeito). A metrica alternativa disponivel (taxa de conclusao)
   nao mostra Equatorial sistematicamente pior. Com isso, dos 3 mecanismos
   cotados para o padrao do item 4 (renda, tarifa, fila de conexao): renda
   enfraquecida (item 4, Equatorial tem renda MAIOR mas MMGD pior), tarifa
   REJEITADA na direcao oposta (item 5), fila de conexao INCONCLUSIVA por
   bloqueio de dado (este item). NENHUM mecanismo concreto foi confirmado.

   **CASO ENCERRADO por decisao do usuario (sessao 06/07/2026), mesmo
   tratamento do caso "Sul x Seguranca da Posse" (ver secao propria): o
   padrao geografico (Grupo Equatorial com MMGD residencial e % Vazio de
   Acesso piores que o resto do Nordeste, item 4) continua real e
   documentado, mas nenhum dos 3 mecanismos cotados (renda, tarifa, fila de
   conexao) foi confirmado - renda enfraquecida, tarifa rejeitada na direcao
   oposta, fila de conexao bloqueada por ausencia do campo DatLim para
   Equatorial no dataset ANEEL usado. NAO RETOMAR sem fonte/evidencia nova
   que justifique reabrir (ex.: dataset alternativo com prazo de conexao
   preenchido para MA/PI/AL, ou nova hipotese de mecanismo ainda nao
   cotada).**

7. **Comunicar o motivo do "sem dado" na interface do mapa - NOVO, registrado
   na sessao de validacao do frontend (09/07/2026), NAO INICIADO.** Na
   validacao do mapa choropleth, o usuario estranhou municipios em cinza no
   indicador de tarifa residencial (concentrados em Norte, Sudeste e Sul).
   Nao e bug: e cobertura real da base (ver secao "Extensao do teste de
   tarifa para todas as distribuidoras") - 753 municipios excluidos de
   proposito por area de concessao dividida entre multiplas distribuidoras
   (padrao comum no Sul, dezenas de cooperativas de eletrificacao rural ao
   lado das grandes) + 63 sem tarifa homologada no periodo. O mapa exibe
   "sem dado" corretamente, mas a interface nao explica POR QUE - e a mesma
   situacao vai se repetir com outros indicadores de cobertura parcial
   (ex.: percentual_tsee quando desbloquear). Melhoria proposta: tooltip/
   nota na legenda ou no painel de detalhe do municipio explicando o motivo
   da ausencia por indicador (exige expor o motivo da exclusao na API ou
   manter um catalogo de notas de cobertura no frontend, a decidir).
   Prioridade baixa - exibicao/UX, nao dado.

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
  regioes. Levantado em sessao de 03/07/2026.

  **PESQUISA DE VIABILIDADE - 1a PASSADA (sessao 07/07/2026, so via busca web,
  Chrome indisponivel na hora) achou o dataset mas nao confirmava colunas reais.**

  **CONFIRMADO por inspecao direta (sessao 07/07/2026, Chrome reconectado,
  dicionario de dados real + API `datastore_search` consultada ao vivo):**
  - Dataset: **SAMP - Balanco** (`dadosabertos.aneel.gov.br/dataset/samp-balanco`),
    542.641 linhas, mensal desde 2003, atualizado mensalmente (ultima carga
    15/06/2026). Base legal: Resolucao Normativa ANEEL 1.003/2022.
  - **Colunas reais (12)**: `DatGeracaoConjuntoDados`, `NumCPFCNPJ`, `NomAgente`,
    `AnmCompetenciaBalanco`, `DscModalidadeBalanco`, `DscFluxoEnergia`,
    `DscCctBalanco`, `DscClassificacaoAgente`, `AnoReferenciaBalanco`,
    `MesReferenciaBalanco`, `DscDetalheBalanco`, `VlrEnergia`.
  - **GRANULARIDADE CONFIRMADA: por DISTRIBUIDORA (CNPJ/NomAgente) x mes, SEM
    NENHUM campo de municipio/conjunto** - confirma a suspeita original. Diferente
    de MMGD, indicadores sociais e INDQUAL (municipio nativo ou resolvido via
    tabela de juncao), este indicador so entraria no Atlas via desagregacao
    (ex.: proporcional ao mercado consumidor por municipio, usando a BDGD como
    peso) - esforco de engenharia bem maior que os extractors atuais.
  - **CONFIRMADO: perdas Tecnicas e Nao-Tecnicas SAO segregadas**, como VALORES
    categoricos do campo `DscCctBalanco` (nao colunas proprias): "Perdas Tecnicas",
    "Perdas Nao-Tecnicas", "Perdas Totais", sob `DscModalidadeBalanco` = "Perdas na
    Distribuicao (valor medido)" OU "(valor faturado)" - ambas as visoes (medida e
    faturada) existem, em kWh (`VlrEnergia`). Exemplo real (Energisa Acre,
    2003-01): Perdas Tecnicas = 6.109.263 kWh, Perdas Nao-Tecnicas = 9.974.728 kWh,
    Perdas Totais = 16.083.991 kWh (valor medido). 125.341 das 542.641 linhas
    totais contem "Perda" no `DscModalidadeBalanco` - dado rico e bem populado.
  - **CONCLUSAO**: dado real, rico e de boa qualidade, mas o GARGALO CONTINUA
    sendo granularidade por distribuidora (nao municipio) - confirmado, nao so
    suspeitado. Se este indicador for priorizado, o proximo passo e desenhar a
    metodologia de desagregacao municipal (nao um extractor simples de upsert
    direto como os demais).

  **INVESTIGACAO INICIADA (sessao 08/07/2026) - CAMINHO DE RESOLUCAO MELHOR
  ENCONTRADO: join por CNPJ, nao por nome.** Ao reler `schema_qualidade.sql` e
  `etl_indqual.py` (template ja usado para resolver municipio->distribuidora na
  tarifa residencial), foi descoberto que `qualidade_conjuntos` tem tanto
  `sig_agente` QUANTO `num_cnpj VARCHAR(20)` (populado de `NumCNPJ` do INDQUAL).
  Como o SAMP-Balanco tem `NumCPFCNPJ` (CNPJ exato da distribuidora), o join
  fica por CNPJ - EXATO, sem a ambiguidade textual que a tarifa precisou
  resolver via `SigAgente` (nomes de distribuidora nem sempre batem
  caractere-a-caractere entre datasets ANEEL diferentes).

  Reconfirmado ao vivo via `datastore_search` (nao so a documentacao da sessao
  anterior): estrutura e valores batem exatamente com o ja registrado acima.
  Descoberta nova: `sort=AnmCompetenciaBalanco desc` mostra que a competencia
  mais recente com dado e **202605** (mai/2026) - nao necessariamente toda
  distribuidora reporta no mes mais recente (defasagem de reporte e normal
  neste tipo de dataset regulatorio).

  Script exploratorio escrito (`backend/src/etl/analises/
  investigar_perdas_nao_tecnicas_renda.py`, somente leitura): baixa o Parquet
  do SAMP-Balanco (recurso `cffe3c15-9d3e-4187-ae63-e097cf88c0af`, ~3,8 MB -
  bem menor que o CSV de 132 MB), filtra `DscModalidadeBalanco` = "Perdas na
  Distribuicao (valor medido)" e `DscCctBalanco` em
  {"Perdas Tecnicas","Perdas Nao-Tecnicas"} na competencia mais recente,
  calcula `percentual_perdas_nao_tecnicas` = NaoTecnicas/(Tecnicas+NaoTecnicas)
  por distribuidora (normalizado em % para nao confundir tamanho de mercado
  com qualidade da distribuidora), resolve municipio->CNPJ via
  `qualidade_conjunto_municipio`/`qualidade_conjuntos` (mesmo criterio da
  tarifa: municipio com multiplas distribuidoras fica sem valor unico), e
  testa a hipotese via Spearman (bruta + por regiao) contra
  `renda_media_domiciliar`.

  **CAUTELA REGISTRADA NO PROPRIO SCRIPT, AINDA NAO VERIFICADA**: nao ha
  confirmacao nesta sessao de que o formato de CNPJ em `qualidade_conjuntos.
  num_cnpj` (vindo do INDQUAL) bate exatamente com o formato em
  `SAMP-Balanco.NumCPFCNPJ` (podem divergir em pontuacao/zeros a esquerda,
  sao fontes ANEEL diferentes). O script normaliza (mantem so digitos) dos
  dois lados antes do join e imprime um alerta explicito se a taxa de
  casamento ficar abaixo de 30% - **o resultado da correlacao so deve ser
  confiado se essa taxa vier razoavel (a maioria dos municipios com CNPJ
  unico conseguindo casar)**.

  **PENDENTE (download)**: o download do Parquet direto da ANEEL foi bloqueado
  no sandbox proprio desta sessao (mesma restricao de allowlist ja vista com
  `ftp.cptec.inpe.br` - `403 Forbidden`/`X-Proxy-Error: blocked-by-allowlist`),
  entao o script foi desenhado para rodar no terminal do usuario. O usuario
  rodou e o arquivo (~3,8MB) ficou salvo em
  `backend/src/etl/data/raw/aneel_samp_balanco/samp-balanco.parquet` (dentro
  da pasta do projeto, sincronizada via OneDrive) - isso permitiu inspecionar
  o arquivo real diretamente no sandbox desta sessao (leitura de arquivo local
  ja baixado nao esbarra na restricao de allowlist, so o download direto da
  ANEEL esbarrava).

  **2 BUGS REAIS ENCONTRADOS E CORRIGIDOS (08/07/2026), so descobertos ao
  rodar contra o arquivo de producao (nao apareceriam so lendo a API
  `datastore_search`, que serve os dados via uma camada JSON com tipos
  diferentes do Parquet bruto):**
  1. **`AnmCompetenciaBalanco` e int64 no Parquet, nao string.** A 1a
     tentativa do usuario (`MES_REFERENCIA="202605"` comparado como string)
     deu 0 linhas - falha SILENCIOSA (sem erro, sem match). Corrigido
     comparando com `int(MES_REFERENCIA)`.
  2. **`NumCPFCNPJ` tambem e int64, nao string - perde zero a esquerda.**
     CNPJs cujo 1o digito e "0" (ex.: Energisa Acre, "04065033000170")
     viram inteiros de 13 digitos (4065033000170) ao serem lidos do Parquet.
     Confirmado contra o arquivo real: **15 de 54 distribuidoras (28%)**
     tem CNPJ comecando com zero na competencia testada - sem correcao, o
     join por CNPJ teria uma taxa de erro enorme e silenciosa. Corrigido
     com `zfill(14)` dentro de `normalizar_cnpj()` (seguro aplicar aos dois
     lados do join - CNPJ ja completo fica inalterado).

  **ACHADO SUBSTANTIVO (nao e bug, e caracteristica real do dataset) - LAG DE
  PROCESSAMENTO, NAO DE DISPONIBILIDADE**: o mes mais recente (202605,
  mai/2026) tem so 16 linhas de "Perdas na Distribuicao (valor medido)" e
  NENHUMA delas e "Perdas Tecnicas"/"Perdas Nao-Tecnicas" (so "Perdas
  Totais"). A cobertura por distribuidora da quebra fina (tecnica x
  nao-tecnica) cai de forma continua e acentuada: ~57 (baseline 2024) ->
  54/52/52/51/47 (jan-jul/2025) -> despenca para 26/23/24/23/23/22/21/20
  (ago/2025-mar/2026) -> 0 (abr-mai/2026). Ou seja, a granularidade fina
  demora MUITO mais para ser processada/publicada do que o agregado "Perdas
  Totais". **Mes escolhido para a 1a rodada: 202503 (mar/2025), com 54 de
  ~57 distribuidoras historicas (~95% de cobertura)** - o mes mais recente
  com cobertura essencialmente completa. Reavaliar esse valor em sessoes
  futuras (o lag de processamento pode diminuir com o tempo).

  **ACHADO SUBSTANTIVO ADICIONAL - VALORES NEGATIVOS DE "PERDAS NAO-TECNICAS"
  no modo "valor medido"**: confirmado contra o arquivo real (competencia
  202503) que **11 de 53 distribuidoras (~21%)** tem "Perdas Nao-Tecnicas"
  NEGATIVA (ex.: -31.803.169 kWh), gerando percentuais fisicamente
  impossiveis (de -436% a +784%). Interpretacao: reflete a metodologia de
  calculo RESIDUAL da ANEEL para perdas nao-tecnicas (perdas totais menos
  perdas tecnicas ESTIMADAS por modelo tecnico - quando a estimativa tecnica
  excede o total medido no periodo, o residuo da negativo). Nao e erro deste
  script nem do dataset em si - e uma limitacao conhecida de metodologias de
  perda residual, mas teria distorcido gravemente a correlacao se nao
  filtrado. Corrigido: o script agora exclui do painel qualquer percentual
  fora do range fisicamente valido [0,100]%, com aviso explicito de quantas
  distribuidoras foram excluidas.

  **RESULTADO FINAL (08/07/2026, competencia 202503, apos os 3 fixes acima)
  - HIPOTESE NAO CONFIRMADA, SINAL FRACO E NAO ROBUSTO POR REGIAO:**
  - Taxa de casamento CNPJ: 2.098 de 4.783 municipios com CNPJ unico
    conseguiram percentual de perdas (~44%) - acima do limiar de alerta de
    30%, join funcionando razoavelmente (nao e um problema de formato de
    CNPJ, e sim de cobertura: das ~57 distribuidoras historicas so 54
    tinham dado nesta competencia, e cada distribuidora cobre um numero
    diferente de municipios).
  - **Correlacao bruta nacional: rho = -0,0457, p = 0,036, n = 2.098** - na
    direcao prevista pela hipotese (renda mais alta -> % perdas nao-tecnicas
    mais baixo), estatisticamente significativa, mas com magnitude
    NEGLIGENCIAVEL (compare com precipitacao x ressarcimento: rho parcial
    +0,19 - a chuva teve efeito ~4x maior). Nota: esta e uma correlacao
    BRUTA, nao parcial (nao controlada por urbanizacao/regiao como foi feito
    na investigacao de clima) - o efeito real, se existir, provavelmente e
    ainda menor.
  - **Sensibilidade por regiao - NAO ROBUSTO** (usando o mesmo criterio de
    robustez estabelecido na investigacao de clima: mesmo sinal em todas as
    regioes validas):
    - Centro-Oeste: rho = **+0,3500**, p = 9,7e-08, n=220 - **FORTEMENTE NA
      DIRECAO OPOSTA** a hipotese (renda mais alta -> MAIS perdas
      nao-tecnicas, nao menos).
    - Nordeste: rho = -0,0646, p=0,024, n=1.218 - direcao prevista, fraco.
    - Norte: rho = -0,1243, p=0,039, n=276 - direcao prevista, fraco-moderado.
    - Sudeste: rho = -0,1781, p=0,0006, n=366 - direcao prevista, o mais forte
      dos que confirmam.
    - Sul: rho = NaN, n=18 - amostra pequena demais para calcular (poucos
      municipios do Sul tem CNPJ unico + dado nesta competencia).
  - **CONCLUSAO**: apenas 3 de 5 regioes validas concordam em direcao com a
    hipotese (Nordeste, Norte, Sudeste - todas fracas), Centro-Oeste diverge
    fortemente e na direcao oposta, Sul e inconclusivo por amostra pequena.
    Isso NAO passa no criterio de robustez usado no resto do projeto (a
    precipitacao teve 5/5 regioes E 3/3 tercis concordantes antes de ser
    formalizada). Hipoteses possiveis para a divergencia do Centro-Oeste (nao
    testadas): grandes propriedades rurais/agronegocio com padrao de consumo
    e fiscalizacao diferentes do resto do pais; ou efeito de 1 unico mes
    (ruido), ja que este teste usou so uma competencia, nao uma media de 12
    meses como planejado originalmente na cautela do proprio script.
  - **DECISAO**: NAO formalizar como indicador do Atlas neste estado - sinal
    fraco demais e nao robusto para justificar um novo schema/coluna. Se
    revisitado no futuro, os proximos passos naturais seriam (nenhum feito
    ainda): (1) trocar 1 mes por media de 12 meses para reduzir ruido, (2)
    rodar correlacao PARCIAL controlando renda+urbanizacao (como no script de
    clima), (3) investigar especificamente por que Centro-Oeste diverge antes
    de descartar ou aceitar a hipotese.

  **APROFUNDAMENTO EM ANDAMENTO (08/07/2026, por decisao do usuario)**: os 3
  proximos passos listados acima foram todos escritos em
  `backend/src/etl/analises/aprofundar_perdas_nao_tecnicas_12meses.py`
  (somente leitura): (1) janela de 12 meses (202404-202503, mesma janela
  confirmada com cobertura completa na 1a rodada) SOMANDO
  perdas_tecnicas/nao_tecnicas antes de calcular o percentual (nao faz media
  de percentuais mensais); (2) correlacao parcial controlando
  `percentual_populacao_rural` (mesma variavel de urbanizacao ja usada em
  `analisar_correlacao_mmgd_renda.py`), nacional e por regiao, mais
  sensibilidade por tercil de urbanizacao; (3) diagnostico dedicado do
  Centro-Oeste testando a hipotese do confundidor rural/agronegocio (renda x
  %rural e %rural x %perdas, dentro da propria regiao, mais a correlacao
  parcial renda x perdas controlando %rural SO dentro do Centro-Oeste).

  Validado contra o arquivo de producao ja baixado (mesmo Parquet da 1a
  rodada, ja em cache local): **58 distribuidoras** aparecem em pelo menos 1
  mes da janela (vs. 54 na competencia unica testada antes), **50 delas**
  com os 12 meses completos. A soma de 12 meses **reduziu mas NAO eliminou**
  o problema de perdas-nao-tecnicas negativa visto na 1a rodada: **9 de 58
  distribuidoras (~15%)** ainda ficam com percentual fora do range [0,100]%
  mesmo apos somar o ano inteiro (vs. 11 de 53, ~21%, em 1 mes so) - ou seja,
  para essas 9 distribuidoras especificas o desequilibrio parece ser
  SISTEMATICO (nao so ruido de 1 mes), o script exclui essas do painel com
  aviso explicito.

  **1a EXECUCAO COMPLETA (08/07/2026) - ACHADO METODOLOGICO DECISIVO:
  PSEUDORREPLICACAO EXPLICA TODO O SINAL ANTERIOR, INCLUINDO A DIVERGENCIA DO
  CENTRO-OESTE.** O teste em nivel de municipio reproduziu o padrao da 1a
  rodada de forma ainda mais forte (bruta nacional rho=-0,226, p=3e-30,
  n=2.488; Centro-Oeste rho=+0,36 a +0,37, p~1e-8, n=221) - forte o
  suficiente para levantar suspeita antes de aceitar. Causa raiz confirmada:
  o indicador e medido por DISTRIBUIDORA, e cada municipio so HERDA o valor
  da sua distribuidora - **os "n" municipios de qualquer correlacao NAO sao
  observacoes independentes**. Nacionalmente, 2.488 municipios com
  percentual valido vêm de so **29 distribuidoras distintas** (razao media
  85,8 municipios/distribuidora). Por regiao, a razao e ainda mais extrema:
  Centro-Oeste 221 municipios / **so 4 distribuidoras**, Nordeste 1.231/7,
  Norte 276/5, Sudeste 366/6, Sul 394/8.

  **A divergencia do Centro-Oeste, especificamente, e um artefato de n=3**:
  apos excluir 1 das 4 distribuidoras por percentual invalido, sobram
  exatamente 3 distribuidoras distintas gerando os 221 municipios (141 + 74
  + 1, aproximadamente = 221): CNPJ ...199 (renda R$3.469, 39,4% perdas nao
  tec., 141 municipios), CNPJ ...150 (renda R$3.149, 32,9%, 74 municipios),
  CNPJ ...192 (renda R$6.659, 42,9%, so 1 municipio no painel). Essas 3
  distribuidoras estao PERFEITAMENTE ordenadas (quanto maior a renda, maior
  o % de perdas) - com exatamente 3 pontos, isso da rho=+1,0 TRIVIALMENTE
  (confirmado por calculo direto: `spearmanr([3148.6,3469.7,6658.8],
  [32.9,39.4,42.9])` = rho=+1,0000, p=0) - qualquer conjunto de 3 pontos
  pode ser perfeitamente ordenado por acaso, isso nao e evidencia de nada.
  O "p=1e-8" visto no teste municipal era so esse mesmo padrao de n=3
  REPLICADO ~74 a 141 vezes cada, inflando artificialmente a significancia.

  **Teste corrigido, em nivel de distribuidora (n = observacoes reais
  independentes)**: nacional n=29 - abaixo do minimo de 30 amostras que o
  proprio projeto usa como criterio de confiabilidade em toda parte
  (`N_MINIMO_AMOSTRA`, ver `analisar_correlacao_mmgd_renda.py`) - o script
  corretamente retorna NaN em vez de reportar um rho enganoso. Por regiao,
  os n's sao ainda menores (Centro-Oeste=3, Norte=5, Sudeste=6, Nordeste=7,
  Sul=8) - nenhum chega perto do minimo para qualquer inferencia estatistica
  valida.

  **CONCLUSAO DEFINITIVA**: nao e "sinal fraco" nem "nao robusto por
  regiao" como a 1a rodada sugeriu - e que o SAMP-Balanco, na granularidade
  real em que e publicado (por distribuidora, ~29 a 58 distribuidoras
  distintas com dado utilizavel em todo o Brasil), simplesmente NAO TEM
  poder estatistico suficiente para testar esta hipotese com o rigor que o
  resto do Atlas exige (n>=30, robustez por regiao/tercil). Isso nao e um
  problema de metodologia deste script (ja corrigido 3 vezes: tipos int64,
  valores negativos, agora pseudorreplicacao) - e um limite estrutural do
  proprio dataset nesta granularidade. Qualquer aumento de "n" municipal
  (testar mais meses, testar mais variaveis) NAO aumenta o numero real de
  distribuidoras independentes, que e o teto real desta analise.
  **DECISAO**: encerrar esta linha de investigacao - nao formalizar como
  indicador do Atlas. Reabrir soh se surgir uma fonte de dado com
  granularidade municipal NATIVA de perdas nao-tecnicas (nao existe
  atualmente, ver 1a pesquisa de viabilidade acima).

- **Queima de equipamentos** (transformadores/eletrodomesticos por sobretensao) -
  tende a concentrar onde a rede tem pouca protecao (para-raios, aterramento)
  combinado com alta incidencia de raios (densidade de descargas atmosfericas maior
  em partes do Centro-Oeste/Norte). Levantado em 03/07/2026.

  **PESQUISA DE VIABILIDADE - 1a PASSADA (sessao 07/07/2026, so busca web) achou
  os datasets candidatos mas sem confirmar colunas reais.**

  **CONFIRMADO por inspecao direta (sessao 07/07/2026, Chrome reconectado):**
  - Dataset do lado do RESSARCIMENTO: **INDGER - Dados Comerciais**
    (`indger-dados-comerciais.csv`, dentro de "INDGER - Indicadores Gerenciais da
    Distribuicao"), 63 colunas, mensal desde dez/2023, atualizado 5/07/2026 (dado
    bem recente). Base legal do ressarcimento: Resolucao Normativa ANEEL 1.000/2021.
  - **ACHADO IMPORTANTE - GRANULARIDADE MUNICIPAL CONFIRMADA**: o dicionario real
    tem a coluna `CodMunicipioIBGE` (campo 7 de 63) - diferente do SAMP-Balanco
    acima, este dataset JA VEM em nivel municipio x distribuidora (`SigAgente`) x
    mes (`DatReferenciaInformada`), o MESMO padrao de granularidade que MMGD,
    INDQUAL e indicadores sociais ja usam no projeto. Isso muda a avaliacao:
    diferente de perdas tecnicas (acima), este indicador poderia entrar no Atlas
    como um extractor comum (upsert direto por municipio), sem desagregacao.
  - **Colunas relevantes para ressarcimento por dano** (de 63 totais):
    `QtdSolicRessarcimentoDano` (qtd de solicitacoes), `QtdRessarcIndeferido`
    (indeferidas), `VlrPendentePgtRessarcDanoDefe` (valor pendente de pagamento,
    deferido), `VlrPagoRessarcDano` (valor efetivamente pago).
  - **LIMITACAO CONFIRMADA**: o dataset NAO tem nenhum campo de CAUSA do dano
    (raio/sobretensao atmosferica vs. outras causas) - so conta solicitacoes e
    valores, sem classificar motivo. Ou seja, `QtdSolicRessarcimentoDano` e um
    proxy de "danos eletricos em geral" (queima de equipamento por qualquer
    causa - sobretensao de rede, oscilacao, raio etc.), nao um indicador
    especifico de raio. O cruzamento com densidade de raios (INPE/ELAT, abaixo)
    seria uma correlacao INFERIDA (mais fraco que os raio-a-raio de ressarcimento
    que a hipotese original supunha), nao uma causa ja rotulada na fonte.
  - Densidade de raios (INPE/ELAT): mesma avaliacao da 1a passada - dado real
    existe ("Densidade de Descargas Atmosfericas (Ng)", `data.inpe.br/geonetwork`,
    climatologia TRMM/LIS 1988-2011, mesmo padrao ja aceito no projeto para
    Irradiacao Solar/INPE), mas em formato raster/shapefile nacional, exigindo
    processamento GIS (agregacao por poligono municipal via PostGIS) - nao
    confirmado via inspecao direta nesta sessao (manual do BDGD e a pagina do
    geonetwork sao PDF/canvas, nao extraiveis como texto pelo navegador).
  - Protecao de rede (para-raios/aterramento) na BDGD: **AINDA NAO CONFIRMADO** -
    tentativa de ler o Manual de Instrucoes da BDGD falhou (PDF renderizado como
    imagem/canvas, sem texto extraivel) e busca web nao achou o codigo de
    entidade especifico. Recomendacao: **abandonar esse eixo do cruzamento
    original** (proteção de rede como moderador) a menos que alguem consiga
    abrir o PDF manualmente e confirmar - nao vale mais tempo de busca as cegas.
  - **AVALIACAO GERAL ATUALIZADA**: o indicador de RESSARCIMENTO POR DANOS
    ELETRICOS (sozinho, sem a hipotese de causa-raio) e VIAVEL e muito mais
    simples do que se pensava - vem em nivel municipal nativo, mesmo padrao dos
    extractors existentes. A hipotese ORIGINAL (queima por sobretensao de raio
    especificamente, cruzando com protecao de rede) fica mais fraca - o dado nao
    distingue causa, e o lado de protecao de rede segue nao confirmado. Duas
    linhas de produto possiveis daqui: (a) mais simples, indicador de "danos
    eletricos per capita" por municipio (proxy geral de qualidade/confiabilidade
    da rede, sem atribuir causa) - viavel como extractor comum; (b) mais ambiciosa
    e ainda especulativa, correlacionar esse indicador com densidade de raios do
    INPE via GIS, sabendo que a causalidade fica inferida, nao confirmada pela
    fonte.
  - **PROXIMO PASSO CONCRETO se priorizado**: (1) desenhar extractor de
    `indger-dados-comerciais.csv` (padrao ja usado no projeto, upsert por
    municipio) para `QtdSolicRessarcimentoDano`/`VlrPagoRessarcDano`; (2) se
    quiser seguir com o cruzamento de raios, avaliar o esforco de processar o
    raster do INPE via PostGIS antes de comprometer a sessao a isso.

  **PESQUISA DE VIABILIDADE - cobertura nacional (MERGE/ERA5), sessao
  07/07/2026, apos o sinal robusto na amostra restrita a estacoes INMET
  (ver secao de resultado do script mais abaixo):**

  - **Precipitacao - MERGE/CPTEC-INPE: CONFIRMADO, viavel, sem conta/login.**
    FTP publico `ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/DAILY/` - 1 arquivo
    `.grib2` por dia desde 1998 (confirmado ate 2026), grade nacional
    (America do Sul), resolucao **0,1 grau (~11 km)**, confirmada lendo o
    `.ctl` real (`xdef 1001 linear -120.05 0.1`, `ydef 924 linear -60.05
    0.1`). Variavel `PREC` = precipitacao de superficie (kg/m² = mm,
    acumulado 24h) + `NEST` = numero de estacoes pluviometricas que
    alimentaram aquele ponto de grade (proxy de confianca - `NEST=0` e
    puramente satelite, sem gauge local). Fonte: GPM-IMERG V07B (satelite)
    fundido com rede de pluviometros - mesmo raciocinio ja aceito no projeto
    para o Atlas de Irradiacao Solar do proprio INPE (produto "gridded" de
    referencia em vez de interpolacao propria). Arquivos pequenos (~400
    KB/dia) - 2 anos (2024-2025) e ~300 MB, tranquilo de baixar.

  **DIAGNOSTICO ESTAGIO 0 (executado 07/07/2026) - leitura MERGE confirmada,
  COM RESSALVA IMPORTANTE:** `diagnosticar_leitura_merge_grib2.py` baixou e
  leu com sucesso 1 dia de teste (15/01/2024) via `cfgrib`/`xarray`.
  **Achado: o `cfgrib` renomeia as variaveis errado.** O `.ctl` oficial deste
  arquivo (conferido via Chrome, direto no FTP) diz explicitamente que so
  existem 2 variaveis, nesta ordem: `PREC` (precipitacao de superficie) e
  `NEST` (numero de estacoes). O `cfgrib`, porem, rotula a 1a variavel como
  `rdp` ("Precipitation from radar") e a 2a como `prmsl` ("Pressure reduced
  to MSL") — rotulos ERRADOS. Causa: o CPTEC reaproveita, sem tabela local
  propria reconhecida pelo eccodes, os mesmos codigos numericos
  discipline/categoria/parametro que a tabela PADRAO da OMM usa para
  "precipitacao de radar" e "pressao ao nivel do mar" — problema conhecido de
  tabelas GRIB2 locais nao documentadas para bibliotecas genericas. A POSICAO
  bate exatamente com o `.ctl` (1a variavel=PREC, 2a=NEST) e os valores fazem
  sentido (NaN no canto da 2a variavel = NEST=0/undef, plausivel em area sem
  estacao). **Regra para qualquer script que ler MERGE**: identificar a
  variavel de precipitacao pela ORDEM/POSICAO no dataset (a primeira),
  nunca pelo nome que o cfgrib atribui (`rdp`/`prmsl` sao rotulos genericos
  errados, nao confiar neles).

  **PROVA DE CONCEITO COMPLETA (executada 07/07/2026) - BUG ENCONTRADO E
  CORRIGIDO: convencao de longitude.** Primeira rodada de
  `prova_conceito_merge_precipitacao_x_inmet.py` (15 municipios, jan/2024)
  deu razao MERGE/INMET entre 0,01 e 0,23 - muito abaixo do plausivel
  (esperava-se mesma ordem de grandeza). Causa confirmada com
  `diagnosticar_convencao_longitude_merge.py`: **a grade do MERGE guarda
  longitude na convencao 0-360° (valores reais de 239.95 a 339.95), NAO em
  -180/180 como o `.ctl` "descreve"** (`.ctl` e um artefato do GrADS,
  formato diferente do GRIB2 real por baixo). Sem converter, `.sel(longitude=
  -38.51, method="nearest")` pegava o ponto MAIS PROXIMO NUMERICAMENTE dentro
  de um array todo positivo (240 a 340) - ou seja, a BORDA OESTE da grade
  (Pacifico), nao o Brasil. Corrigido usando `longitude % 360` (Python
  resolve negativo corretamente: -38.51 % 360 = 321.49, testado e confirmado
  batendo com o ponto certo). **Regra para qualquer script/extractor que ler
  MERGE**: sempre converter longitude de municipios (-180/180, PostGIS) para
  0-360 antes de indexar na grade - nao confiar no `.ctl` para a convencao
  real. Latitude NAO tem esse problema (-60.05 a 32.25, mesma convencao dos
  dois lados).

  **Resultado apos a correcao (07/07/2026): POC do MERGE PASSOU.** Razao
  MERGE/INMET entre 0,59 e 2,79 nos 13 municipios com par valido (2 dos 15,
  Tucuma/Tucurui-PA, sem dado INMET no mes para comparar) - mesma ordem de
  grandeza, sem viés grosseiro. **Nota metodologica sobre a tendencia de
  MERGE > INMET em varios casos (ex.: Salvador 2,63x, Rio de Janeiro
  2,79x)**: NAO e bug, e diferenca de JANELA DE ACUMULACAO - `precipitacao_
  max_mes` do INMET e o pico de 1 HORA (MAX sobre microdados horarios),
  enquanto PREC do MERGE e acumulado de 24H (`tdef 1 linear ... 24hr` no
  `.ctl`); um dia inteiro de chuva tende a somar mais que so a hora mais
  forte dele, entao MERGE tender a ficar ACIMA do INMET e o sentido
  ESPERADO dessa assimetria, nao um sinal de erro. Se um extractor de
  producao for construido, comparar contra o max DIARIO do INMET (nao o max
  horario) seria a comparacao mais correta - nao feito aqui porque o
  objetivo desta POC era validar o PIPELINE TECNICO (download, leitura,
  indexacao espacial), nao a correspondencia estatistica fina entre fontes.

  **CONCLUSAO DA FASE DE PROVA DE CONCEITO (07/07/2026): pipeline tecnico
  validado para as duas variaveis (chuva via MERGE, vento via ERA5)** -
  download, leitura GRIB2 (com os 2 gotchas documentados: renomeio de
  variavel do cfgrib e convencao de longitude), extracao por
  nearest-point e comparacao com INMET, tudo funcionando fim-a-fim.

  **DECISAO DO USUARIO (07/07/2026): construir zonal statistics real ANTES
  de escalar** (em vez de escalar com a simplificacao nearest-point
  primeiro). Feito com `prova_conceito_zonal_statistics_merge_precipitacao.py`,
  usando `rasterstats` (CONFIRMADO que instala limpo via pip, sem GDAL de
  sistema - traz `rasterio` com wheels pre-compiladas). **Achado tecnico
  importante, capturado num teste sintetico ANTES de rodar contra dado
  real**: o padrao do rasterstats (`all_touched=False`) so conta um pixel se
  o CENTRO dele cair dentro do poligono - para municipio pequeno (menor que
  a celula de ~11km do MERGE), isso pode dar `count=0` mesmo com sobreposicao
  real. Corrigido usando `all_touched=True` (conta qualquer pixel que o
  poligono tocar) - **regra para qualquer extractor de zonal statistics no
  projeto, nao so este caso**.

  **Resultado da POC de zonal statistics (jan/2024, 15 municipios):
  validado.** Checagem de consistencia interna (zonal max >= nearest-point
  max, que TEM que valer matematicamente se a implementacao estiver correta,
  ja que o ponto mais proximo do centroide e um dos pixels que entram no
  zonal) passou 15/15. Os saltos de magnitude entre zonal e nearest-point
  foram grandes em alguns casos (ex.: Brasilia: 39,75mm nearest-point ->
  134,44mm zonal) - **NAO e bug**: zonal MAX sobre dezenas de pixels x 31
  dias tem uma "area de busca" estatistica muito maior que 1 unico ponto x
  31 dias, e estatistica de MAXIMO e mecanicamente puxada pra cima quanto
  mais se amostra (mais pixels, mais dias = mais chance de pegar um extremo
  localizado) - propriedade esperada de estatistica de valores extremos, nao
  reflete erro de implementacao. **Implicacao pratica importante**: o zonal
  max do MERGE NAO e diretamente comparavel em magnitude ao pico de UMA
  unica estacao INMET (sao medidas conceitualmente diferentes - maximo
  espacial+temporal sobre todo o territorio do municipio vs. maximo temporal
  de 1 ponto so) - a comparacao com INMET serve para validar ORDEM DE
  GRANDEZA E DIRECAO (zonal >= nearest, sem valor implausivel), nao para
  esperar numeros parecidos. Para o proposito real deste indicador (testar
  correlacao com ressarcimento), zonal max e alias a escolha CONCEITUALMENTE
  MAIS CORRETA: capta se ALGUM lugar do municipio teve um evento extremo no
  mes, que e exatamente a exposicao a risco que interessa para dano
  eletrico em qualquer ponto da rede do municipio, nao so onde a estacao
  fica.

  **Zonal statistics do ERA5/vento (07/07/2026): replicada com sucesso,
  mesma logica do MERGE.** `prova_conceito_zonal_statistics_era5_vento.py`
  reusou sem alteracao a formula de conversao de longitude e o flip de
  latitude ja validados no MERGE (testados antes contra dado real com um
  grid sintetico, incluindo o colapso `time`/`step` -> campo 2D de rajada
  maxima do mes). Checagem de consistencia (zonal >= nearest-point) passou
  10/10 nos municipios de teste (Nordeste, jan/2024). **Diferenca notavel em
  relacao ao MERGE**: os saltos de magnitude zonal-vs-nearest foram bem mais
  MODESTOS para vento (a maioria entre -5,7 e +1,4 m/s de diferenca contra
  INMET) do que para chuva (que chegou a +90mm em Brasilia) - faz sentido
  fisicamente: rajada de vento e um campo espacialmente mais suave/
  homogeneo ao longo de dezenas de km do que chuva convectiva (muito
  localizada), entao "olhar mais pixels" infla menos o maximo observado.
  Reforca que o MERGE tende a exigir mais cautela na leitura dos numeros
  absolutos do que o ERA5.

  **CONCLUSAO: zonal statistics validada para as DUAS variaveis (chuva e
  vento)** - metodologia pronta e testada, `all_touched=True` confirmado
  necessario nos dois casos (ainda mais critico no ERA5, celula de ~28km
  maior que a do MERGE ~11km).

  Proximo passo: decisao do usuario sobre escalar para cobertura nacional
  real (todos os ~5.573 municipios, 2024-2025) e rodar a correlacao com
  ressarcimento usando essa cobertura, ao inves da amostra restrita e
  enviesada de ~571 municipios com estacao
  INMET propria.

  **DECISAO DO USUARIO (07/07/2026): escalar.** Criados 3 scripts:
  `escalar_merge_precipitacao_nacional.py` (baixa ~730 dias, 2024-2025, tira
  o maximo pixel a pixel do mes via numpy ANTES de rodar zonal_stats - so 24
  chamadas zonais, uma por mes, cobrindo todos os ~5.573 municipios de uma
  vez, nao 5.573 x 730 - necessario para viabilizar em escala nacional);
  `escalar_era5_vento_nacional.py` (mesma logica, bbox calculado a partir do
  territorio real dos municipios via SQL, nao adivinhado); e
  `investigar_clima_ressarcimento_cobertura_nacional.py` (reusa a logica de
  ressarcimento/renda ja validada, so troca a fonte do clima pelos parquets
  nacionais). Os 2 primeiros NAO gravam no Postgres - salvam parquet local
  (`backend/src/etl/data/raw/clima_nacional/`), mesma postura de "ainda nao e
  extractor formal" ja adotada no resto desta linha de investigacao -
  decisao de formalizar (schema Drizzle) fica para depois de confirmar que o
  sinal se sustenta em escala nacional.

  **CRASH EM PRODUCAO E FIX (08/07/2026):** primeira rodada real (background,
  nohup) do `escalar_era5_vento_nacional.py` morreu no mes 3 (marco/2024) com
  `PermissionError: [Errno 13] Permission denied` ao tentar abrir o arquivo
  `.grib` LOGO APOS o download terminar com sucesso. Causa mais provavel:
  lock transitorio do OneDrive (a pasta do projeto e sincronizada, mesmo
  quirk de atraso de sincronizacao ja documentado no CLAUDE.md/ARQUITETURA.md
  para o par Read-tool/bash) - o arquivo grande (~44MB) provavelmente estava
  sendo indexado/sincronizado pelo OneDrive no instante em que o script tentou
  ler. **Falha de design mais grave que o erro em si**: a 1a versao dos 2
  scripts de escala nacional acumulava TODOS os 24 meses em memoria e so
  salvava 1 parquet no FINAL - o crash no mes 3 perdeu tambem o trabalho ja
  feito nos meses 1 e 2 (que nunca tinham sido persistidos). **Corrigido nos
  2 scripts** (`escalar_merge_precipitacao_nacional.py` e
  `escalar_era5_vento_nacional.py`): (1) cada mes agora salva seu proprio
  arquivo parquet assim que fica pronto (`precipitacao_por_mes/AAAA_MM.parquet`,
  `vento_por_mes/AAAA_MM.parquet`) - rodar de novo PULA os meses ja
  concluidos, nao perde nada num crash futuro; (2) `abrir_grib_com_retry`
  tenta reabrir o arquivo ate 6x com espera de 5s entre tentativas antes de
  desistir - trata o `PermissionError` como transitorio, nao fatal. Criado
  `consolidar_parquets_climaticos.py` para juntar os parquets por mes num
  arquivo unico por variavel (rodavel a qualquer momento, mesmo com os 24
  meses incompletos). **Regra geral para qualquer job longo neste projeto que
  rode sobre a pasta sincronizada por OneDrive**: sempre persistir progresso
  incrementalmente (por unidade pequena de trabalho, ex.: por mes) em vez de
  acumular tudo em memoria ate o final, e tratar erro de leitura logo apos
  escrita como possivelmente transitorio (retry), nao fatal de imediato.

  Execucao (download + zonal statistics para 2 anos x Brasil inteiro) ainda
  PENDENTE de terminar - resultado nao disponivel nesta entrada.

  **RESULTADO FINAL - COBERTURA NACIONAL (08/07/2026, os 2 scripts de escala
  terminaram os 24 meses completos, `investigar_clima_ressarcimento_
  cobertura_nacional.py` executado): 133.681 combinacoes municipio x mes,
  5.571 municipios distintos (de 5.573 - cobertura efetivamente nacional,
  NAO mais os ~571 restritos a estacao INMET propria).**

  | Variavel | rho parcial (renda) | regioes com mesmo sinal | tercis com mesmo sinal |
  |---|---|---|---|
  | Precipitacao maxima do mes (MERGE, zonal) | +0,1922 (p<0,001) | 5/5 | 3/3 |
  | Rajada de vento maxima do mes (ERA5, zonal) | +0,0793 (p<0,001) | 2/5 | 3/3 |

  **Comparacao com a versao restrita a INMET (571 municipios,
  investigar_clima_ressarcimento_danos_eletricos.py): "precipitacao robusta
  em todos os cortes, vento robusto em todos os cortes apos corrigir o
  artefato de painel do Nordeste".**

  - **Precipitacao: sinal CONFIRMADO em escala nacional.** Robusto nas 5
    regioes e nos 3 tercis de urbanizacao, coeficiente (+0,19) da mesma
    ordem de grandeza da versao INMET. Boa evidencia de que o vies de
    amostra (so municipios com estacao propria, tendencialmente maiores/
    urbanos) NAO estava distorcendo essa conclusao - o efeito parece real e
    generalizavel.
  - **Vento: sinal ENFRAQUECE e fica INCONSISTENTE em escala nacional -
    NAO confirma a robustez vista na amostra INMET.** Coeficiente cai pela
    metade (+0,08 vs a magnitude da precipitacao) e o sinal por regiao
    inverte em 3 das 5 (Nordeste -0,116, Norte -0,030, Sul -0,006 negativos;
    Centro-Oeste +0,026, Sudeste +0,061 positivos) - só 2/5 regioes
    concordam com o sinal nacional, contra 5/5 da precipitacao. **Leitura
    mais provavel**: a robustez de vento vista na amostra INMET (so
    municipios com estacao propria) provavelmente refletia, ao menos em
    parte, uma caracteristica da AMOSTRA ENVIESADA (cidades maiores/mais
    urbanizadas, com infraestrutura e padrao de rede diferentes), nao um
    efeito climatico universal - consistente com a limitacao ja conhecida
    do ERA5 (rajada localizada mal capturada por reanalise de ~28km) somada
    a heterogeneidade regional de exposicao a vento severo (ex.: fenomenos
    convectivos do Sul/Sudeste sao estruturalmente diferentes de ventos do
    Nordeste).

  **CONCLUSAO GERAL DESTA LINHA DE INVESTIGACAO (iniciada em 03/07/2026 como
  ideia nao priorizada "Queima de equipamentos", fechada em 08/07/2026)**:
  a hipotese de clima x ressarcimento por danos eletricos tem suporte SOLIDO
  e GENERALIZAVEL para PRECIPITACAO (efeito modesto mas real, rho~0,19,
  robusto em toda regiao/urbanizacao, cobertura nacional via MERGE) e
  suporte FRACO/NAO CONFIRMADO para VENTO em escala nacional (o resultado
  antes promissor na amostra INMET nao se sustentou - provavel artefato de
  amostra enviesada, nao efeito real generalizado). Tratar com cautela
  qualquer uso futuro do vento (ERA5) como indicador nesta dimensao -
  precipitacao (MERGE) e a variavel climatica com evidencia mais solida para
  eventualmente virar indicador formal do Atlas, se o projeto decidir seguir
  por esse caminho (schema Drizzle, extractor em `loaders/`, ainda NAO
  feito - toda esta investigacao permanece em `analises/`, exploratoria,
  como o resto desta linha de trabalho).

  Proximo passo (nao iniciado): decisao do usuario sobre formalizar
  precipitacao (MERGE) como indicador do Atlas (schema + extractor formal),
  investigar mais a fundo por que vento diverge por regiao antes de
  descartar, ou passar para outro item da fila de trabalho.

  **FORMALIZADO (08/07/2026): precipitacao (MERGE) agora e indicador oficial
  do Atlas.** Criados: schema `indicadores_climaticos.ts` (referencia
  `unidades_espaciais.id`, mesmo padrao de `mmgd_indicadores`), migration
  `0019_criacao_indicadores_climaticos.sql`, extractor formal
  `backend/src/etl/loaders/extrair_precipitacao_mensal_merge.py` (reusa a
  logica ja validada de `escalar_merge_precipitacao_nacional.py`, com
  checkpoint no proprio banco em vez de parquet - verifica por mes se todos
  os municipios ja foram gravados antes de reprocessar). Migration aplicada
  e extractor executado com sucesso: 133.752 linhas (5.573 municipios x 24
  meses), 0 nulos, valores entre 0 e 296,75mm, media 35,73mm - padrao sazonal
  conferido manualmente para Sao Paulo (mais chuva no verao jan-mar, menos
  no inverno jun-jul), consistente com o clima real da regiao. Vento (ERA5)
  CONTINUA nao formalizado - fica em `analises/` como exploratorio, dado o
  sinal fraco/inconsistente em escala nacional (ver acima). CLAUDE.md
  atualizado (migrations 0000-0019, 20 extractors, nota de 9a dimensao nao
  prevista no DRF original).

  **ERA5/vento: prova de conceito completa PASSOU de primeira, sem bug.**
  10 municipios do Nordeste, jan/2024, razao ERA5/INMET entre 0,65 e 0,98 -
  o ERA5 sistematicamente ABAIXO do INMET, exatamente o esperado (reanalise
  a ~28 km borra rajadas localizadas, limitacao ja documentada acima) e sem
  nenhum caso fisicamente implausivel (perto de zero, negativo, fora de
  ordem). Sinal de que o pipeline ERA5 (dataset correto, deaccumulo via max
  com skipna, sel por nearest) esta correto.
  - **NOVA COMPLEXIDADE**: diferente dos extractors tabulares atuais, isso
    exige (1) nova dependencia Python para ler GRIB2 (`cfgrib`/`eccodes` ou
    `pygrib` - nenhuma delas usada no projeto ate agora; **CONFIRMADO nesta
    sessao que `pip install cfgrib xarray eccodes` funciona sem precisar de
    conda nem biblioteca de sistema separada**, testado num ambiente Linux
    limpo) e (2) logica de agregacao
    espacial (zonal statistics: para cada municipio, achar os pontos de
    grade que caem dentro do poligono e tomar o maximo) via PostGIS/
    `rasterstats` - padrao novo, mais parecido com o processamento de
    territorio/geometrias do que com os extractors tabulares simples.
  - **Vento/rajada nacional - MAIS FRACO, com atrito real.** Nao existe um
    "MERGE do vento" brasileiro equivalente. **CORRECAO (08/07/2026): a nota
    original abaixo estava ERRADA sobre qual produto tem a variavel de
    rajada — verificado diretamente na documentacao do CDS antes de
    escrever qualquer script, nao presumido.** ERA5-Land (~9 km) **NAO tem**
    variavel de rajada — so vento sustentado (componentes u/v a 10m).
    Rajada instantanea (`fg10`, shortName `i10fg`/`10m_wind_gust_since_
    previous_post_processing`) so existe no **ERA5 "completo"**
    (`reanalysis-era5-single-levels`), que tem resolucao MAIS GROSSEIRA:
    **0,25° (~28 km)**, nao 9 km. Ou seja, a limitacao de sub-escala de
    grade (explosao de vento localizada, ponto ja levantado abaixo) e ainda
    mais severa do que o registrado originalmente. MAS: (1) exige CRIAR
    CONTA no Copernicus Climate Data Store - acao que o usuario precisa
    fazer pessoalmente, nao delegavel (feito pelo usuario em 07/07/2026);
    (2) rajada de vento e um fenomeno de sub-escala de grade (explosao
    localizada) que reanalises como ERA5 sao CONHECIDAS por subestimar - o
    mesmo ponto fraco que fez a estacao INMET (medicao direta) ser mais
    confiavel para isso, mesmo com cobertura espacial pior — agravado pela
    resolucao de 28 km em vez dos 9 km presumidos originalmente.
  **DIAGNOSTICO ESTAGIO 0 (executado 07/07/2026) - leitura ERA5/rajada
  confirmada:** `diagnosticar_leitura_era5_rajada_vento.py` baixou com
  sucesso 1 dia de teste (15/01/2024, Nordeste) via `cdsapi` (conta
  Copernicus criada e termos aceitos pelo usuario) e leu com
  `cfgrib`/`xarray` sem erro. Valores de `fg10` (rajada maxima desde o
  ultimo pos-processamento) plausveis, ~6-11 m/s no recorte testado.
  **Achado tecnico (nao e bug, e estrutura esperada do ERA5):** os campos
  "since previous post-processing" vem organizados como `time` (ciclo de
  previsao-base, 00Z/12Z) x `step` (passo dentro do ciclo) - o cfgrib monta
  um hipercubo denso dessas duas dimensoes, mas so uma fatia de cada
  combinacao (time, step) e valida; o resto vem `NaN` de proposito. O
  horario real de cada valor esta na coordenada `valid_time`, nao em
  `time`/`step` isolados - a prova de conceito completa precisa selecionar
  por `valid_time` e descartar NaN antes de agregar (max diario/mensal),
  nao tirar estatistica direto do array bruto (ver
  github.com/ecmwf/cfgrib, discussao de campos acumulados/de-acumulacao).
  Instalacao confirmada no venv real do projeto (nao so no ambiente de
  teste): `pip install cdsapi cfgrib xarray eccodes` funcionou sem conda.

  - **PLANO PROPOSTO** (original, antes da decisao abaixo): priorizar
    precipitacao via MERGE primeiro (sem atrito de conta, resultado tecnico
    mais solido) - fazer uma prova de conceito pequena (poucos dias/
    municipios, validando contra o que o INMET ja mostrou) antes de
    comprometer a baixar/processar 2 anos inteiros. Vento nacional ficaria
    em segundo plano, dependente de decisao do usuario sobre criar conta no
    Copernicus e aceitar a limitacao conhecida de subestimar picos.
  - **DECISAO DO USUARIO (07/07/2026): seguir com OS DOIS em paralelo**
    ("Os dois (chuva + vento)"), nao so precipitacao primeiro. Precipitacao
    (MERGE) comeca imediatamente pela prova de conceito (sem bloqueio,
    nenhuma acao pessoal necessaria). Vento (ERA5-Land) precisa que o
    usuario crie a conta Copernicus CDS pessoalmente (accao que nao pode ser
    feita em nome dele - ver instrucoes passadas na sessao) antes do script
    correspondente poder ser escrito/testado; ate la, roda em paralelo mas
    com inicio defasado.

  **DECISAO DO USUARIO (sessao 07/07/2026): ampliar a hipotese de causa** - nao
  restringir a raios, incluir tambem chuva (precipitacao) e vento (velocidade/
  rajada) como possiveis fatores climaticos correlacionados com ressarcimento
  por danos eletricos, mesmo sabendo que a relacao ficaria INFERIDA (o dado de
  ressarcimento nao rotula causa, ver acima).

  **PESQUISA DE VIABILIDADE - chuva e vento (sessao 07/07/2026, confirmado via
  Chrome, inspecao direta da pagina Base dos Dados):**
  - Fonte: **INMET/BDMEP** (Banco de Dados Meteorologicos para Ensino e Pesquisa),
    ja disponivel tratado na **Base dos Dados** (`basedosdados.br_inmet_bdmep.*`)
    - MESMA fonte/mecanismo de acesso ja usado no projeto para RAIS e Mortalidade
      Infantil (BigQuery via `gcloud auth application-default login`), o que
      reduz bastante o atrito de integracao comparado a uma fonte nova.
  - Tabela `basedosdados.br_inmet_bdmep.microdados` (12,20 GB) - granularidade
    **HORARIA por ESTACAO** (`id_estacao`, `data`, `hora`), NAO por municipio
    diretamente. Colunas relevantes confirmadas: `precipitacao_total` (horaria),
    `vento_velocidade` (horaria), `vento_rajada_max`, `vento_direcao` (+ outras
    variaveis: temperatura, umidade, pressao, radiacao global). Cobertura
    temporal gratuita: 2000-05 a 2025-12-30; dados de 2026 exigem assinatura BD
    Pro (paga) - dados gratuitos ja cobrem 25+ anos, mais que suficiente para
    climatologia ou serie historica.
  - Tabela `basedosdados.br_inmet_bdmep.estacao` (metadado, 40 KB) - **JA TEM
    `id_municipio` (IBGE 7 digitos)** por estacao, junto de geolocalizacao e
    altitude. Ou seja, o join estacao->municipio VEM PRONTO da Base dos Dados,
    diferente do raster de raios do INPE/ELAT (que exigiria processamento GIS
    proprio) - esta fonte e tabular de ponta a ponta, mesmo padrao dos
    extractors BigQuery ja existentes no projeto.
  - **RESSALVA (mesma natureza da limitacao de raios/INPE)**: estacoes INMET sao
    pontos (algumas centenas no Brasil), NAO cobrem os 5.573 municipios do Atlas
    - a maioria dos municipios NAO tem estacao propria. Precisaria decidir entre
    (a) restringir a analise aos municipios que hospedam uma estacao (cobertura
    parcial, mais simples), ou (b) atribuir a cada municipio a estacao mais
    proxima (exige calculo de distancia via PostGIS, mais parecido com o
    tratamento que o raster de raios exigiria de qualquer forma).
  - **AVALIACAO GERAL**: chuva/vento (INMET/BDMEP) e MAIS VIAVEL tecnicamente que
    densidade de raios (INPE/ELAT) para este cruzamento - mesma fonte/mecanismo
    de acesso ja dominado no projeto (BigQuery), dado tabular (nao raster), e
    ja vem com id_municipio por estacao. A limitacao de cobertura espacial
    (nem todo municipio tem estacao) e real, mas e um problema de escopo/
    metodologia, nao de formato de dado.
  - **PROXIMO PASSO CONCRETO se priorizado**: decidir a estrategia de cobertura
    (estacoes dentro do municipio vs. estacao mais proxima), agregar
    `precipitacao_total`/`vento_rajada_max` por municipio x mes (para casar com
    a granularidade mensal do `indger-dados-comerciais.csv`), e so entao rodar
    a correlacao com `QtdSolicRessarcimentoDano` - mesma metodologia (Spearman +
    parcial) ja validada na linha de investigacao MMGD x indicadores sociais.

  **SCRIPT CRIADO (sessao 07/07/2026), AINDA NAO EXECUTADO**:
  `backend/src/etl/analises/investigar_clima_ressarcimento_danos_eletricos.py`
  - implementa exatamente a recomendacao acima: (1) pico mensal de clima, nao
  media (evento extremo, nao clima medio); (2) restrito a municipios que
  CONTEM uma estacao INMET (via `id_municipio` ja resolvido pela Base dos
  Dados, sem atribuicao por proximidade); (3) painel municipio x mes (nao
  municipio agregado); (4) Spearman bruto + parcial controlando renda,
  reusando a funcao ja validada de `analisar_correlacao_mmgd_renda.py`. Baixa
  `indger-dados-comerciais.csv` da ANEEL (cacheado localmente, ~117 MiB) e
  consulta `basedosdados.br_inmet_bdmep` via BigQuery (mesma credencial
  `gcloud auth application-default login` ja usada por RAIS/Mortalidade
  Infantil). Janela temporal: 2024-2025 (sobreposicao INDGER x INMET
  gratuito).

  **RESULTADO (executado 07/07/2026, apos corrigir 2 bugs reais achados so ao
  rodar contra o arquivo de verdade - delimitador `;` nao `,`, e
  `DatReferenciaInformada` em formato de data completa "AAAA-MM-DD" nao
  "AAAAMM" como no SAMP-Balanco):** painel final de 12.638 combinacoes
  municipio x mes, 571 municipios distintos (dos 5.573 totais - so os que tem
  estacao INMET propria, confirma a cobertura direta esperada de ~10%).

  | Variavel climatica (pico do mes) | n | rho bruto | rho parcial (renda) |
  |---|---|---|---|
  | Precipitacao maxima do mes | 9.276 | +0,1947 (p<0,001) | +0,1878 (p<0,001) |
  | Rajada de vento maxima do mes | 9.817 | +0,1594 (p<0,001) | +0,1370 (p<0,001) |

  **Leitura**: correlacao POSITIVA, estatisticamente significativa (p<0,001) e
  praticamente INSENSIVEL ao controle por renda (rho quase nao muda) - meses
  com pico de chuva/vento mais forte num municipio tendem a ter mais
  solicitacoes de ressarcimento por dano eletrico NESSE MESMO MES, mesmo
  nesta amostra restrita (571 municipios com estacao INMET). Magnitude e
  MODESTA (rho ~0,14-0,19, nao um preditor dominante) - esperado, dado que
  `QtdSolicRessarcimentoDano` mistura todas as causas de dano, nao so clima
  (ver limitacoes no proprio script). O sinal passou no criterio combinado
  com o usuario ("se aparecer mesmo na amostra limitada, vale considerar
  buscar cobertura nacional real") - decisao do usuario apos isso: testar
  robustez por regiao/urbanizacao antes de decidir o proximo passo (mesma
  metodologia ja usada na linha MMGD x indicadores sociais).

  **TESTE DE ROBUSTEZ (executado 07/07/2026, mesma sessao)** - script
  estendido com sensibilidade por regiao e por tercil de urbanizacao:

  | Variavel | rho parcial nacional | regioes com mesmo sinal | faixas de urbanizacao com mesmo sinal |
  |---|---|---|---|
  | Precipitacao maxima do mes | +0,1878 | 5/5 | 3/3 |
  | Rajada de vento maxima do mes | +0,1370 | 4/5 | 3/3 |

  **Precipitacao: ROBUSTO** - sinal positivo em TODAS as 5 regioes (Centro-Oeste
  +0,191, Nordeste +0,216, Norte +0,073, Sudeste +0,254, Sul +0,137, n entre 84
  e 142 municipios por regiao) e nos 3 tercis de urbanizacao (+0,167 a +0,220).
  Resultado limpo, sem outlier regional.

  **Vento: quase robusto, com 1 excecao** - Nordeste destoa (rho = -0,087,
  UNICA regiao com sinal negativo; demais: Centro-Oeste +0,104, Norte +0,094,
  Sudeste +0,168, Sul +0,130). Robusto nos 3 tercis de urbanizacao (todos
  positivos). NAO investigado ainda por que o Nordeste destoa para vento
  especificamente (mesmo tipo de anomalia regional isolada ja visto para
  outros indicadores no projeto - ver casos Sul/Seguranca da Posse e
  Centro-Oeste/Irradiacao Solar - mas ainda sem diagnostico dedicado aqui).

  **CONCLUSAO ATE AQUI**: hipotese de clima (chuva/vento) x ressarcimento por
  danos eletricos tem suporte SOLIDO nesta amostra restrita - precipitacao
  robusta em todos os cortes, vento robusto em todos os cortes apos corrigir
  o artefato de painel do Nordeste (ver abaixo). Unica ressalva que continua
  de pe: a amostra e restrita e enviesada (so 571 municipios com estacao
  INMET propria, cidades tendencialmente maiores) - proxima decisao real e
  se vale a pena buscar cobertura nacional (MERGE/CPTEC-INPE) para tirar
  esse viés antes de tratar como indicador do Atlas.

  **DIAGNOSTICO DEDICADO Nordeste/vento (executado 07/07/2026, 3 lentes -
  mesmo padrao ja usado nos casos Sul/Centro-Oeste anteriores):**
  - Colinearidade: rho(renda, rajada_max) cai de +0,133 nacional para +0,003
    dentro do Nordeste (praticamente nulo) - a relacao renda-vento
    desaparece localmente, mas isso sozinho nao explica o sinal invertido.
  - Heterogeneidade por UF: as 9 UFs do Nordeste tem mediana de rajada
    bastante homogenea (12,4 a 14,4 m/s) e ressarcimento sem padrao claro
    inversamente relacionado - NAO ha um unico estado isolado puxando o
    resultado (diferente do caso EQUATORIAL GO no Centro-Oeste, que era
    limpo e isolado).
  - Top/bottom municipio-mes por rajada: **achado central** - o TOP 10 (maior
    rajada do mes) e dominado por poucos municipios com leitura
    SISTEMATICAMENTE alta em varios meses diferentes (Davinópolis/MA aparece
    5 das 10 linhas, em meses distintos, sempre com rajada 24,8-24,9 m/s) -
    isso e assinatura de estacao/microclima com leitura tipicamente ventosa,
    NAO de evento extremo pontual daquele mes especifico. Casos de rajada
    verdadeiramente extrema (Araguanã/MA 39,6 m/s; Piranhas/AL 28,9 m/s)
    tem ressarcimento ZERO no mes. Ja o BOTTOM 10 (rajada mais fraca) tem
    casos com ressarcimento RELATIVAMENTE ALTO (Itapipoca/CE, rajada 6,9 m/s,
    ressarc. 0,67 - mais alto que quase todo o TOP 10).
  - **INTERPRETACAO**: o padrao parece ser um ARTEFATO DO DESENHO EM PAINEL
    SEM EFEITO FIXO DE MUNICIPIO (limitacao ja documentada no proprio
    script) - alguns municipios tem leitura de vento estruturalmente mais
    alta (posicao da estacao, microclima) que se repete mes a mes sem
    relacao com evento extremo, dominando o topo da distribuicao sem
    corresponder a mais dano. Isso dilui/inverte a correlacao dentro da
    regiao, sem que seja necessariamente um efeito social ou de
    infraestrutura eletrica diferente no Nordeste - mesmo tipo de armadilha
    metodologica ja neutralizada antes noutros casos do projeto (sentinela
    DatLim, campos de metadado errados no TSEE).
  - **CONFIRMADO (executado 07/07/2026, correcao "within-municipio"/demeaning
    - subtrai a media de cada municipio antes de correlacionar, isolando so
    a variacao mes a mes, aproxima efeito fixo sem modelo completo):** o
    sinal do Nordeste **VIRA POSITIVO** (+0,0804, p<0,001, n=2.082) - de
    -0,087 ("entre municipios", com o viés das leituras estruturalmente
    ventosas) para +0,080 ("dentro de cada municipio", isolando so o evento
    do mes). Precipitacao tambem se mantém robusta e ate mais forte nesse
    corte (nacional +0,2224, Nordeste +0,2148, ambos p<0,001).
  - **CONCLUSAO FINAL desta excecao: CONFIRMADO ARTEFATO DE DESENHO EM
    PAINEL, nao uma diferenca social/regional real.** O sinal negativo do
    Nordeste na analise "entre municipios" era causado por alguns municipios
    com leitura de vento estruturalmente mais alta (posicao da estacao,
    microclima) e ressarcimento baixo, sem relacao com evento extremo daquele
    mes - ao isolar a variacao dentro do mesmo municipio (demeaning), Nordeste
    passa a concordar com o resto do pais (positivo, significativo). Caso
    ENCERRADO com explicacao completa, mesmo padrao de rigor ja aplicado a
    outras armadilhas de dado identificadas no projeto (sentinela DatLim,
    metadado TSEE) - nao e preciso investigar mais.
- **Fila/capacidade de conexao de MMGD por distribuidora (grupo Equatorial)** -
  candidato levantado a partir do achado da hipotese de distribuidora/concessionaria
  (ver secao "Hipotese de distribuidora/concessionaria", sessao 06/07/2026): EQUATORIAL
  GO tem MMGD residencial per capita menos da metade de EMS/EMT no Centro-Oeste, apesar
  de irradiacao semelhante - hipotese de fila/capacidade de conexao de micro/
  minigeracao especifica do grupo Equatorial (presente tambem no Para, Maranhao, Piaui,
  Alagoas, e agora CEEE-Equatorial no RS). Nao investigado ainda se a ANEEL publica
  dado de fila de conexao/tempo de espera por distribuidora em dataset aberto.
- **Validade de constructo regional do Indice de Seguranca da Posse no Sul** - 5a
  hipotese para o caso "Sul x Seguranca da Posse" (levantada pelo usuario, sessao
  06/07/2026), de categoria diferente das 4 ja descartadas (renda, agronegocio/
  irrigacao, tipologia habitacional, distribuidora - todas mecanismos
  economicos/geograficos). Hipotese: o indice pode estar medindo coisas diferentes
  em contexto rural vs. urbano dentro do Sul. O peso do indice (1,0 proprio / 0,5
  alugado / 0,0 cedido) assume que "nao proprio" reflete precariedade, mas no Sul
  "alugado"/"cedido" pode capturar em boa parte arrendamento rural FORMALIZADO e
  estavel - regiao com forte presenca de cooperativas de credito rural nascidas
  ali (Sicredi/Sicoob) - em vez de ocupacao irregular urbana, que e o padrao que o
  peso do indice presume nas demais regioes. Se confirmado, "baixa seguranca da
  posse" no Sul rural nao significaria vulnerabilidade real, quebrando a
  comparabilidade do indice entre regioes (nao um confundidor a controlar, mas um
  problema de validade do proprio indicador). RESSALVA: os municipios extremos ja
  identificados no ranking de MMGD para este caso (Piraquara, Almirante Tamandare,
  Itaperucu, Rio Branco do Sul) sao periferia METROPOLITANA de Curitiba, nao rural
  profundo - a hipotese precisa ser testada na composicao agregada da correlacao
  regional (rho do Sul como um todo), nao necessariamente nesses casos pontuais.
  Caminhos de teste sugeridos para a proxima sessao: (1) checar se
  `percentual_populacao_rural` modula o desvio de sinal dentro do Sul (subgrupo
  rural vs urbano); (2) verificar se o Censo permite decompor regime de posse por
  situacao do domicilio (rural/urbano) alem do dado municipal agregado atual; (3)
  usar presenca/densidade de agencias Sicredi/Sicoob por municipio como proxy de
  formalizacao do arrendamento rural. Nao investigado ainda - proximo candidato
  apos as 4 tentativas descartadas (ver secao "Hipotese de distribuidora/
  concessionaria" acima).

  **ATUALIZACAO (5a hipotese testada, sessao 06/07/2026) - ver secao "Teste da
  hipotese de validade de constructo regional" abaixo: NAO CONFIRMADA na forma
  proposta.** O tercil mais rural do Sul teve sinal POSITIVO e significativo
  (rho=+0,103, p=0,041) - direcao esperada, nao anomala -, contrariando a
  premissa de que arrendamento rural estaria "quebrando" o indice. O tercil
  mais urbano do Sul e que teve relacao indetectavel (rho=-0,039, p=0,436,
  NAO significativo). Ver bullet abaixo (6a hipotese) para o candidato que
  emergiu desse resultado.

- **Regularizacao fundiaria bloqueada por APA/mananciais na regiao
  metropolitana de Curitiba (Sul x Seguranca da Posse)** - 6a hipotese
  candidata, emergida do teste da 5a hipotese (ver secao "Teste da hipotese de
  validade de constructo regional", sessao 06/07/2026), CORRIGIDA apos
  contra-argumento do usuario (mesma sessao) e pesquisa externa. Formulacao
  ORIGINAL (paineis solares fisicamente restritos por licenciamento ambiental
  em APA) foi REFUTADA: confirmado via Instrucao Normativa IAT no 20/2025-PR
  que a instalacao de paineis solares em cobertura/telhado de empreendimento
  residencial JA EXISTENTE fica DISPENSADA de licenciamento ambiental estadual
  no Parana (mesmo padrao em SP e outros estados) - nao ha proibicao de placa
  em telhado por causa de APA. Formulacao CORRIGIDA (mecanismo documental, nao
  fisico): a APA Estadual do Piraquara e a APA do Irai (Decreto Estadual
  2200/2000 e 9021/2018) tem parte expressiva do territorio de Piraquara
  (93% em area de manancial) ocupada por parcelamento irregular do solo -
  confirmado que a Prefeitura NAO EMITE alvara de construcao/reforma para
  lotes de loteamento nao aprovado. Hipotese: essa barreira de regularizacao
  fundiaria (nao a placa em si) pode impedir o titular de formalizar a
  matricula/endereco fiscal do imovel exigido pela distribuidora para
  registrar conexao de MMGD em seu nome - conectando este caso ao proprio
  mecanismo que o Indice de Seguranca da Posse tenta medir (posse informal),
  so que concentrado geograficamente por zoneamento ambiental especifico da
  RMC, nao difuso pelo Sul rural como a 5a hipotese original supunha.

  **ATUALIZACAO (checado 06/07/2026): a parte de "documento de posse impede
  cadastro" foi ENFRAQUECIDA por pesquisa da regulacao real.** Resolucao
  Normativa ANEEL no 1.000/2021 (atualizada pela REN 1.059/2023) exige
  "documento com data que comprove a propriedade OU POSSE do imovel" para
  implantar MMGD, mas e explicitamente FLEXIVEL: veda exigir reconhecimento de
  firma ou formalidade "excessivamente onerosa"; e para NUCLEO URBANO
  INFORMAL CONSOLIDADO (Reurb, Lei 13.465/2017 - categoria que provavelmente
  cobre parte da ocupacao irregular na APA do Piraquara) a comprovacao pode
  ser feita por AUTODECLARACAO do consumidor + comprovante de residencia, sem
  exigir documento formal de propriedade. Ou seja: a ANEEL ja previu esse
  cenario e criou um caminho deliberadamente leve - o mecanismo "posse
  informal bloqueia o cadastro de MMGD" nao tem respaldo forte na regulacao
  nacional como estava formulado.

  **Achado novo, mais especifico, para investigar:** o procedimento da
  COPEL-DIS (NTC 905200 - Acesso de Micro e Minigeracao Distribuida) exige,
  entre os documentos anexados no sistema CAW (Anexo II para <=10kW, Anexo
  III para >10kW), uma "Licenca Ambiental OU Dispensa emitida pelo orgao
  ambiental competente" - um documento DIFERENTE do comprovante de posse,
  especifico de licenciamento ambiental (mesmo com paineis em telhado
  residencial existente dispensados de licenciamento pela IN IAT no
  20/2025-PR, ainda seria preciso obter/anexar o documento de DISPENSA formal
  emitido pelo orgao ambiental, nao presumir a dispensa automaticamente). NAO
  INVESTIGADO ainda: (1) se obter essa dispensa formal junto ao IAT-PR e mais
  dificil/lento para imoveis em lote de parcelamento irregular dentro de APA
  (ex.: se o pedido de dispensa exige matricula/inscricao municipal
  regularizada do imovel, o mesmo problema documental reaparece por essa
  porta, nao pela de posse); (2) se existe shapefile/dataset aberto de
  limites de APA e/ou parcelamento irregular no Parana (IAT/SEMA-PR, COMEC/
  AMEP) para cruzar com os municipios do Sul; (3) se ha correlacao, dentro do
  proprio tercil urbano do Sul, entre indicador de irregularidade fundiaria e
  MMGD residencial per capita.

  **CONCLUSAO FINAL (checado 06/07/2026, texto integral da Instrucao Normativa
  IAT no 20/2025-PR lido): hipotese 6 tambem REFUTADA na porta da dispensa
  ambiental - a mesma que ficara aberta na atualizacao anterior.** A IN
  20/2025 tem DUAS trilhas bem distintas para energia solar, e a leitura
  anterior nao tinha diferenciado as duas:
  (a) **Campo solar em SOLO** (usina/gerador dedicado, medido em hectares) -
  Quadro 1 do Art. 7o: ate 1,5 ha = inexigibilidade; 1,5 a 7,5 ha = precisa de
  DLAM (Declaracao de Dispensa), cujo requerimento (Art. 17) EXIGE certidao do
  Municipio atestando que o local esta em conformidade com o Plano Diretor
  Municipal e legislacao urbanistica - EXATAMENTE o tipo de exigencia que um
  lote de parcelamento irregular reprovaria, confirmando a logica da hipotese
  SE fosse essa a trilha aplicavel.
  (b) **Paineis em cobertura/telhado de empreendimento residencial,
  comercial, industrial ou agropecuario JA EXISTENTE** (Art. 15) - a trilha
  que de fato se aplica a MMGD residencial (posto que MMGD residencial e por
  definicao telhado de casa existente, nao campo solar em solo) - fica
  DISPENSADA de licenciamento ambiental estadual de forma direta, sem as
  exigencias do Art. 17 (sem certidao de conformidade com Plano Diretor, sem
  comprovacao de dominialidade). O ato correspondente e a DILA (Declaracao de
  Inexigibilidade de Licenca Ambiental), emitida de forma AUTOMATICA pelo
  sistema informatizado do IAT para atividades de potencial insignificante
  (Art. 5o) - nao ha analise caso a caso nem certidao municipal.
  **Ou seja: o gargalo documental que sustentaria a hipotese (certidao
  municipal de conformidade urbanistica) existe na regulacao, mas so se
  aplica ao campo solar em solo de 1,5-7,5 ha - uma categoria irrelevante
  para MMGD residencial, que segue a trilha automatica do Art. 15/DILA, sem
  esse gargalo.** RESSALVA: nao foi encontrado um caso concreto documentado
  de pedido de DILA para telhado residencial especificamente em Piraquara
  (a pagina do IAT sobre a "primeira declaracao automatica" nao carregou
  conteudo legivel na consulta) - a conclusao se apoia no texto normativo
  integral, nao em um caso pratico confirmado. **Caso Sul x Seguranca da
  Posse permanece NAO EXPLICADO apos 6 tentativas** (renda, agronegocio/
  irrigacao, tipologia habitacional, distribuidora, validade de constructo
  rural/urbano, regularizacao fundiaria/ambiental) - nenhum novo candidato
  levantado nesta sessao.

### Caso Sul x Seguranca da Posse ENCERRADO (decisao do usuario, sessao 06/07/2026)

Apos 6 tentativas de explicacao descartadas em sequencia - colinearidade com
renda, agronegocio/irrigacao, tipologia habitacional (`percentual_apartamento`),
distribuidora/concessionaria, validade de constructo regional rural/urbano do
Indice de Seguranca da Posse, e regularizacao fundiaria/ambiental bloqueada por
APA (ambas as portas testadas - documento de posse via ANEEL/COPEL-DIS e
dispensa ambiental via IAT-PR - refutadas por texto normativo real) - o
usuario decidiu ENCERRAR a investigacao deste outlier especifico. O padrao
(Sul destoa das outras 4 regioes no sinal da correlacao parcial entre Indice
de Seguranca da Posse e MMGD residencial per capita, controlando renda)
continua real e nao explicado, mas nao sera mais objeto de novas tentativas
de hipotese salvo se surgir fonte ou evidencia nova que justifique reabrir.
Mesmo criterio ja usado no projeto para fechar linhas de investigacao sem
sucesso (ver "Onus excessivo com aluguel - DESCARTADO" acima) - registrado
como decisao consciente, nao como abandono silencioso.

**Efeito pratico:** o Indice de Seguranca da Posse continua fazendo parte do
Atlas normalmente (indice de Moradia, `vw_indices_compostos_moradia_
infraestrutura`) - nenhuma mudanca de schema ou remocao de dado. O que muda e
so a fila de trabalho: este caso sai da lista de pendencias ativas de
investigacao (ver "Fila de trabalho" acima).

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

### Teste da hipotese de validade de constructo regional (Seguranca da Posse, Sul) - sessao 06/07/2026, 5a tentativa

Hipotese (categoria diferente das 4 anteriores - nao mecanismo economico/
geografico, e sim validade de constructo do indicador): o Indice de Seguranca
da Posse pesa 1,0 x %proprio + 0,5 x %alugado + 0,0 x %cedido, assumindo que
"nao proprio" reflete precariedade - premissa pensada para o padrao urbano. No
Sul, com forte presenca de cooperativas de credito rural nascidas na regiao
(Sicredi/Sicoob), "nao proprio" poderia capturar arrendamento rural
formalizado e estavel, nao ocupacao irregular - o indice mediria coisas
diferentes em municipio rural vs. urbano dentro do proprio Sul. Script:
`backend/src/etl/analises/investigar_construto_posse_rural_sul.py` - divide o
Sul (so o Sul, nao tercis nacionais) em tercis de `percentual_populacao_rural`
e recalcula a correlacao parcial (controlando renda) de Indice de Seguranca
da Posse x MMGD residencial per capita em cada tercil.

**RESULTADO: NAO confirma a hipotese como originalmente formulada, mas revela
um padrao mais especifico que reformula o problema.** Correlacao parcial
(controlando renda) por tercil de ruralidade dentro do Sul (n=397 cada):
Mais urbano rho=-0,039 (p=0,436, NAO significativo); Intermediario
rho=+0,127 (p=0,011, significativo); Mais rural rho=+0,103 (p=0,041,
significativo). Leitura correta (o script imprime um veredito automatico
simplificado - "sinal muda, hipotese sustentada" - que NAO deve ser lido
literalmente aqui): o sinal so muda de positivo para levemente negativo no
tercil mais URBANO, mas esse valor nao e estatisticamente significativo (p
alto, n=397) - e mais correto descrever como "relacao ausente/indetectavel
no tercil urbano" do que "sinal invertido no rural", ja que rural e
intermediario tem sinal POSITIVO e significativo, semelhante entre si -
exatamente o OPOSTO da direcao que a hipotese original previa (que apontava
o rural como o lado "anomalo").

**Achado qualitativo mais relevante:** dos 4 municipios outlier ja
identificados no ranking de MMGD residencial do Sul (Piraquara, Itaperucu,
Almirante Tamandare, Rio Branco do Sul), 3 caem no tercil MAIS URBANO
(Piraquara 8,5% rural, Itaperucu 17,0%, Almirante Tamandare 4,4%) e 1 no
intermediario (Rio Branco do Sul 27,7%) - nenhum no tercil mais rural,
contrariando a premissa original de que o problema estaria ligado a
ruralidade/arrendamento agricola. Olhando o bottom 10 completo da inspecao
qualitativa, aparece um padrao geografico ainda mais especifico nao
cogitado antes: Piraquara, Rio Branco do Sul, Itaperucu, Cerro Azul e
Guaraqueçaba sao todos municipios da regiao metropolitana de Curitiba
proximos a areas de protecao ambiental/mananciais (Piraquara, em particular,
sedia parte dos reservatorios que abastecem Curitiba) - candidato a 6a
hipotese, ver secao "Ideias para investigar" para a formulacao CORRIGIDA
(a formulacao inicial - paineis fisicamente restritos por licenciamento
ambiental em APA - foi contestada pelo usuario na mesma sessao e REFUTADA por
pesquisa externa: instalacao de paineis solares em telhado residencial ja
existente e dispensada de licenciamento ambiental no Parana, mesmo dentro de
APA. A formulacao corrigida desloca o mecanismo de "placa proibida" para
"regularizacao fundiaria bloqueada" - a APA do Piraquara nao emite alvara
para lotes de parcelamento irregular, o que pode impedir o titular de
regularizar a documentacao do imovel exigida pela distribuidora para MMGD,
reconectando o caso ao proprio fenomeno que o Indice de Seguranca da Posse
mede, so que concentrado geograficamente por zoneamento ambiental).

**Conclusao:** a 5a tentativa (validade de constructo regional rural/urbano)
NAO E CONFIRMADA na forma proposta - o tercil rural do Sul se comporta bem
(sinal positivo, significativo, direcao esperada), entao nao ha evidencia de
que arrendamento rural formalizado esteja "quebrando" o indice ali. O
problema parece estar concentrado especificamente no tercil urbano do Sul, e
mais especificamente ainda nos municipios metropolitanos de
Curitiba/mananciais - candidato a 6a hipotese (regularizacao fundiaria
bloqueada por APA, formulacao corrigida) fica registrado em "Ideias para
investigar" para proxima sessao. Caso permanece NAO EXPLICADO apos 5
tentativas.

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
e processar as 5 regioes (ATUALIZADO 06/07/2026: agora 2 de 5 regioes
baixadas/testadas - Centro-Oeste e Nordeste, esta ultima via
`investigar_fila_conexao_mmgd_nordeste.py`, criado para testar o caso
Equatorial x Vazio de Acesso, ver item 6 da fila de trabalho; faltam Norte,
Sudeste, Sul), (2) decidir se o ranking fica so no eixo tecnico (prazo/
conexao) ou tambem incorpora justica energetica (cruzar com indicadores
sociais dos municipios atendidos por cada distribuidora), (3) decidir
granularidade de exibicao (nacional por distribuidora? por UF?). Registrado
como ideia de produto, nao como item da fila de dados.

**ACHADO CRITICO PARA ESTE PRODUTO (sessao 06/07/2026, ver item 6 da fila de
trabalho):** o campo `DatLim` (prazo regulatorio, base da metrica "% dentro
do prazo") esta praticamente AUSENTE no recurso do Nordeste para pelo menos 4
distribuidoras - EQUATORIAL MA (0,0% de preenchimento), EQUATORIAL PI (0,1%),
EQUATORIAL AL (0,0%) e Energisa Borborema (0,0%) - contra 86,7% a 100% nas
demais distribuidoras da mesma regiao. Se um ranking publico for construido
sem tratar isso, essas distribuidoras apareceriam com ~0% de cumprimento de
prazo, o que e FALSO (e um vazio de dado, nao desempenho ruim) - erro grave
para um produto que se propoe a ser confiavel/comparativo. Qualquer
implementacao futura deste ranking PRECISA calcular e expor
`pct_datlim_presente` por distribuidora, e excluir ou marcar explicitamente
como "sem dado" as distribuidoras abaixo de um limiar razoavel de
preenchimento - nao mostrar "0% no prazo" como se fosse um resultado real.
Recomendado checar se este mesmo problema se repete nas regioes ainda nao
baixadas (Norte, Sudeste, Sul) antes de priorizar o produto.

**ATUALIZACAO (sessao 06/07/2026): script criado para checar isso, ainda NAO
EXECUTADO.** Script `backend/src/etl/analises/
mapear_desempenho_conexao_mmgd_nacional.py` - baixa e processa as 5 regioes
(reaproveita Centro-Oeste e Nordeste ja baixados, baixa Norte/Sudeste/Sul
pela primeira vez), calcula por distribuidora `pct_datlim_presente_entre_
conectados`, `pct_conectado`, `pct_dentro_do_prazo_entre_conectados` e
mediana de atraso, e sinaliza automaticamente (limiar 50%) quais
distribuidoras tem o campo DatLim ausente demais para confiar na metrica de
prazo - mesmo problema achado para EQUATORIAL MA/PI/AL no Nordeste. Exporta
CSV local (nao versionado) com o resumo nacional completo. Processa uma
regiao por vez e descarta o DataFrame bruto antes da proxima, para nao
repetir o erro de OOM ja visto ao processar o Nordeste inteiro de uma vez
(12,8M linhas). Suporta rodar so uma regiao por vez via variavel de ambiente
REGIAO_UNICA, se a maquina nao aguentar as 5 em sequencia (Sudeste
provavelmente e a maior). Ainda NAO EXECUTADO - proximo passo: rodar e
registrar resultado aqui (Norte/Sudeste/Sul serao baixados pela primeira
vez, podem demorar).

**RESULTADO (executado 06/07/2026): o problema de DatLim ausente NAO e
exclusivo do Grupo Equatorial nem do Nordeste - e mais amplo, mas o Grupo
Equatorial esta desproporcionalmente concentrado nele.** 5 regioes
processadas, ~54,3M pedidos no total (Centro-Oeste 6,31M, Nordeste 12,80M,
Norte 3,37M, Sudeste 19,46M, Sul 12,37M). 11 distribuidoras com
`pct_datlim_presente_entre_conectados` < 50% (limiar de alerta):

| Distribuidora | Regiao | N pedidos | % DatLim presente |
|---|---|---|---|
| Cemig-D | Sudeste | 7.403.789 | 0,0% |
| Equatorial PA | Norte | 1.573.342 | 0,0% |
| Equatorial MA | Nordeste | 956.861 | 0,0% |
| Equatorial AL | Nordeste | 681.123 | 0,0% |
| Energisa Borborema | Nordeste | 71.031 | 0,0% |
| Equatorial AL | Norte (fatia residual) | 10.478 | 0,0% |
| Equatorial PI | Nordeste | 917.875 | 0,1% |
| CEA Equatorial (AP) | Norte | 67.439 | 0,9% |
| CEEE Equatorial (RS) | Sul | 1.048.471 | 1,0% |
| Energisa RO | Norte | 466.842 | 26,7% |
| Celesc-Dis (SC) | Sul | 2.285.765 | 43,5% |

**Achado 1 - Cemig-D (Minas Gerais, Sudeste) e a MAIOR distribuidora do
dataset inteiro (7,4M pedidos, ~13,6% do total nacional) e tem 0,0% de
DatLim preenchido - sem NENHUMA relacao com o Grupo Equatorial.** Isso
mostra que a ausencia de DatLim e um problema de COMPLETUDE DE REPORTE A
ANEEL mais amplo que a hipotese original (nao e um padrao exclusivo de uma
distribuidora ou grupo), e que qualquer produto baseado neste dataset
precisa tratar isso como regra geral, nao excecao pontual.

**Achado 2 - dentro do proprio Grupo Equatorial, ha uma divergencia interna
marcante: EQUATORIAL GO (Centro-Oeste) tem 100,0% de DatLim preenchido,
enquanto TODAS as outras subsidiarias do grupo (PA, MA, AL, PI, CEA/AP, CEEE/
RS) tem entre 0,0% e 1,0%.** Ou seja, das aquisicoes da Equatorial Energia,
Goias e a UNICA com o campo de prazo bem reportado - as demais (que incluem
tanto aquisicoes antigas, MA/PI/AL, quanto recentes, CEEE/RS) compartilham o
mesmo problema de dado, independente de regiao. Isso e consistente com (mas
nao prova) a hipotese de que o problema esta ligado a integracao de sistemas
especifica de cada subsidiaria adquirida pela Equatorial, nao a regiao
geografica - reforca ainda mais que o teste de fila de conexao feito para
MA/PI/AL (item 6, encerrado como INCONCLUSIVO) realmente nao tinha como dar
resultado confiavel com este dataset.

**Achado 3 (nota menor, nao investigada a fundo):** algumas combinacoes
distribuidora x regiao com volume muito baixo (ex.: "Neoenergia Coelba" com
1.568 pedidos aparecendo em "sudeste", 334 em "centro-oeste", 43 em "sul";
"Neoenergia Elektro" com 77 em "sul" e 11 em "norte") tem `pct_conectado`
0,0% e metricas NaN - provavelmente municipios de fronteira classificados no
arquivo regional errado (a distribuidora "correta" de cada uma dessas e
outra regiao). Volume irrelevante (dezenas a poucas centenas de pedidos),
nao afeta nenhuma conclusao, mas fica registrado para nao confundir numa
leitura futura da tabela completa.

CSV completo salvo localmente (nao versionado) em
`backend/src/etl/data/raw/aneel_fila_conexao_mmgd/
desempenho_conexao_mmgd_distribuidoras_nacional.csv`.

**Conclusao para o produto:** o dataset e utilizavel para um ranking
publico, mas SOMENTE com as 11 distribuidoras acima excluidas ou marcadas
como "sem dado de prazo" - caso contrario o ranking mostraria Cemig-D e
metade do Grupo Equatorial como "0% dentro do prazo", o que seria um erro
grave e enganoso (ausencia de dado, nao desempenho). Continua NAO
PRIORIZADO como item da fila de dados - registrado aqui como insumo pronto
para quando o produto for priorizado.

**DECISAO DE ESCOPO (sessao 06/07/2026, a pedido do usuario): produto
PRIORIZADO.** Duas decisoes de escopo tomadas: (1) ESCOPO = tecnico +
justica energetica (nao so desempenho de conexao isolado); (2)
GRANULARIDADE = nacional por distribuidora (nao por UF/regiao).

Script criado: `backend/src/etl/analises/
construir_ranking_distribuidoras_conexao_mmgd.py` - PROTOTIPO DE VALIDACAO
(mesma ressalva de `identificar_vazios_de_acesso.py`: a logica de cruzamento
e composicao do score deve ser reimplementada no backend Node/Express quando
ele existir). Reaproveita o CSV tecnico ja gerado por
`mapear_desempenho_conexao_mmgd_nacional.py` (sem recalcular/rebaixar nada) e
os indicadores sociais + mapeamento municipio->distribuidora ja usados em
`investigar_distribuidora_regioes_problema.py` (`carregar_dados`,
`carregar_municipio_distribuidora`).

**ACHADO METODOLOGICO CENTRAL: o dataset de fila de conexao
(`SigAgenteDistribuicao`) e o schema INDQUAL (`sig_agente`) usam
nomenclaturas DIFERENTES para a mesma distribuidora** (ex.: "Equatorial MA"
vs. "EQUATORIAL MA"; "Neoenergia Coelba" vs. "COELBA"). O script tenta casar
automaticamente (normalizacao + contencao de substring em ambas direcoes),
aplica equivalencias MANUAIS ja confirmadas em sessoes anteriores (EMT/EMS
= Energisa MT/MS, Enel GO = EQUATORIAL GO - ver "Teste do mecanismo tarifa"
e achados de nome de agente no Centro-Oeste), e IMPRIME toda distribuidora
sem par encontrado - essas ficam de fora do eixo de justica energetica (mas
continuam no ranking tecnico), em vez de arriscar cruzamento errado.

Composicao do score (mesma convencao dos indices ja usados no projeto -
normalizacao min-max, 0=melhor/1=pior): eixo tecnico = media de (1-%conectado
normalizado) e (1-%dentro do prazo normalizado, SO quando `prazo_confiavel`
- as 11 distribuidoras com DatLim ausente usam so a metrica de conexao,
marcadas explicitamente, nunca tratadas como "0% no prazo"); eixo justica =
IVS medio (simples, nao ponderado por populacao) dos municipios atendidos
pela distribuidora; score composto = media dos dois eixos, so quando ambos
disponiveis (`score_apenas_tecnico` marca quando a distribuidora nao tem par
no INDQUAL). Exporta CSV local (nao versionado) com o ranking completo.
Ainda NAO EXECUTADO - proximo passo: rodar e registrar resultado aqui
(precisa do banco Postgres local rodando, ja que carrega indicadores
sociais via `carregar_dados`/`carregar_municipio_distribuidora`, diferente
dos scripts anteriores desta linha que so leem Parquet/CSV locais).

**1a EXECUCAO (06/07/2026): so 26/52 distribuidoras casaram com o INDQUAL -
corrigido apos achar um bug de codigo e consultar a lista real de
sig_agente.** Bug: o filtro de contencao de substring exigia
`len(norm_fila) >= 4`, o que zerava candidatos sempre que o nome do lado da
fila de conexao tinha so 3 caracteres (bloqueou "RGE", a maior distribuidora
do RS, 4,77M pedidos, de casar). Corrigido - siglas curtas sao normais neste
dominio (EMT, EMS, RGE, EPB...).

Consultado `SELECT DISTINCT sig_agente FROM qualidade_conjuntos` (115 siglas
reais) para completar o mapeamento manual com confianca, em vez de assumir.
Adicionadas ao script: Energisa PB=EPB, Energisa SE=ESE, Energisa RO=ERO,
Energisa TO=ETO, Energisa AC=EAC, Energisa Borborema=EBO, Energisa Minas
Rio=EMR, Energisa Sul-Sudeste=ESS (todas de alta confianca - mesmo padrao
"Energisa"+sigla de 3 letras ja confirmado para EMT/EMS); Enel SP=ELETROPAULO
(Enel adquiriu a AES Eletropaulo em 2018, mesmo padrao do caso Enel GO/
Equatorial GO); Amazonas Energia=AME e CEEE Equatorial=CEEE-D (Equatorial
adquiriu a CEEE-D/RS em 2021, mesmo padrao); Roraima Energia=BOA VISTA
(historico: federalizada 2001 -> "Boa Vista Energia" -> privatizada e
renomeada "Roraima Energia" 2021 - CONFIANCA MENOR que as demais, conferir
antes de publicar).

CASO AMBIGUO deixado sem mapeamento manual de proposito: "RGE" (fila de
conexao) pode corresponder a "RGE" OU "RGE SUL" no INDQUAL (ambos existem
como sig_agente distintos, possivel resquicio da fusao RGE/AES Sul pos-2021)
- casamento automatico vai achar os 2 candidatos e corretamente marcar como
"sem par unico" em vez de escolher errado.

**ACHADO ADICIONAL: varias distribuidoras pequenas (Chesp, Cocel,
Cooperalianca, Demei, Eflul, Hidropan, Mux Energia) EXISTEM no INDQUAL com
nome identico ao da fila de conexao, mas mesmo assim nao casaram na 1a
execucao - a causa provavel NAO e nome, e sim cobertura: essas distribuidoras
tem 0 registros em `qualidade_conjunto_municipio` (nenhum municipio
associado ao seu "conjunto" nessa tabela), entao nunca aparecem no resultado
de `carregar_municipio_distribuidora`. Outras (Dmed, Forcel, João Cesa, Nova
Palma, Santa Maria) simplesmente NAO EXISTEM na lista de sig_agente do
INDQUAL - provavelmente pequenas demais para estarem sujeitas ao reporte de
qualidade (DEC/FEC). Nenhuma acao tomada sobre isso ainda - registrado para
nao confundir numa leitura futura do "AVISO" de nomes sem par.

Proximo passo: rodar de novo com a correcao + mapeamento ampliado e
registrar o resultado final aqui.

**RESULTADO FINAL (2a execucao, 06/07/2026): 39/52 distribuidoras casadas com
o INDQUAL (antes 26/52).** As 13 restantes sem par: CPFL Santa Cruz, Chesp,
Cocel, Cooperalianca, Demei, Dmed, Eflul, Forcel, Hidropan, Joao Cesa, Mux
Energia, Nova Palma, Santa Maria - a maioria pequenas distribuidoras
municipais/cooperativas do Sul. Confirmado o palpite registrado acima: varias
delas (Chesp, Cocel, Cooperalianca, Demei, Eflul, Hidropan, Mux Energia,
tambem Energisa Borborema apesar do crosswalk EBO ter funcionado) aparecem no
CSV final com `ivs_medio` NaN mesmo quando o nome bateu - confirma que o
problema e cobertura (conjunto sem municipio associado em
`qualidade_conjunto_municipio`), nao nomenclatura.

CSV final salvo em `backend/src/etl/data/raw/aneel_fila_conexao_mmgd/
ranking_distribuidoras_mmgd.csv` (52 distribuidoras, ordenado por score
composto, menor = melhor).

**Leitura do ranking (metodologica, nao definitiva):**
- Topo do ranking (score ~0,00-0,17): quase todo composto por pequenas
  distribuidoras municipais/cooperativas do Sul (Demei, Dmed, Joao Cesa, Mux
  Energia, Hidropan, Eflul, Cooperalianca, Cocel, Forcel) com
  `score_apenas_tecnico=True` - ou seja, o "0,00" delas reflete SO o eixo
  tecnico (sem par no INDQUAL para o eixo de justica), nao e diretamente
  comparavel ao score das distribuidoras com os dois eixos. Qualquer versao
  publica precisa deixar isso visualmente claro (selo "sem dado de justica
  energetica"), nao só a nota de rodapé.
- Das distribuidoras grandes com os dois eixos calculados: RGE (0,292), CPFL
  Paulista (0,297) e Neoenergia Brasilia (0,303) tem os melhores scores
  compostos; Energisa PB (0,637), Cemig-D (0,630, sem prazo confiavel) e CEA
  Equatorial (0,614, sem prazo confiavel) tem os piores.
- Todas as subsidiarias da Equatorial fora de Goias (PI 0,459, PA 0,471, MA
  0,490, AL 0,589, CEA/AP 0,614) ficam concentradas na metade pior do
  ranking - mas ATENCAO METODOLOGICA: parte disso reflete o eixo de justica
  (IVS medio dos municipios atendidos - MA, PI, AL, PA sao estados com IVS
  sistematicamente mais alto/pior no pais), nao so desempenho operacional.
  Um score composto ruim aqui sinaliza "area de atencao prioritaria"
  (operacao + vulnerabilidade social somadas), nao necessariamente "pior
  distribuidora do Brasil em desempenho puro" - importante essa distincao
  ficar clara em qualquer exibicao publica, para nao virar uma leitura
  simplista de "a Equatorial e a pior empresa do Brasil".

**Status do produto:** prototipo de validacao funcional, PRIORIZADO pelo
usuario (decisao desta sessao). Falta, antes de uma versao publica real:
(1) mover a logica para o backend Node/Express quando ele existir (mesma
ressalva de sempre para prototipos desta pasta `analises/`); (2) decidir
tratamento visual dos casos `score_apenas_tecnico=True` e
`prazo_confiavel=False` (nao esconder, mas nao deixar comparar como se fosse
igual); (3) considerar ponderar o IVS medio por populacao do municipio (hoje
e media simples, mesma limitacao ja assumida em outros cruzamentos deste
projeto); (4) decidir se cabe nota metodologica explicita sobre a
concentracao da Equatorial fora-GO no fundo do ranking refletir tambem
regiao/vulnerabilidade social, nao so desempenho.


## Manutencao deste documento

Atualizar ao fim de cada sessao de carga de dados: estado da `unidades_espaciais`,
tabela de dimensoes e fila de trabalho. Decisoes de fontes so mudam com nova pesquisa.
