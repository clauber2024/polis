-- Migration 0026: tabela desempenho_conexao_distribuidoras
--
-- MOTIVACAO (sessao 10/07/2026): primeira peca de persistencia para o
-- produto "ranking publico de distribuidoras por desempenho em conexao de
-- MMGD + justica energetica" (priorizado em 06/07/2026, ver ARQUITETURA.md
-- "Ideia de produto: ranking publico de distribuidoras", e decisoes de
-- exibicao/metodologia em docs/DECISOES.md, ADR "Ranking publico de
-- distribuidoras", 10/07/2026).
--
-- Ate esta migration, o resumo tecnico por distribuidora (pct_conectado,
-- prazo_confiavel, pct_dentro_do_prazo) so existia como CSV local NAO
-- versionado, gerado por scripts de analise
-- (mapear_desempenho_conexao_mmgd_nacional.py +
-- construir_ranking_distribuidoras_conexao_mmgd.py) que leem diretamente o
-- dataset bruto da ANEEL "Atendimento a pedidos de conexoes MMGD" (~54M
-- linhas nas 5 regioes, nunca carregado no Postgres). O backend Node/Express
-- nao tinha como servir esse dado sem essa persistencia.
--
-- sig_agente_indqual ja vem RESOLVIDO nesta tabela (crosswalk entre a
-- nomenclatura do dataset de fila de conexao e o sig_agente real do schema
-- INDQUAL, ja validado no prototipo - ver
-- construir_ranking_distribuidoras_conexao_mmgd.py, MAPEAMENTO_MANUAL_CONFIRMADO)
-- para o backend nao precisar refazer o casamento fuzzy de nomes a cada
-- request - so um JOIN direto com qualidade_conjuntos.sig_agente.
--
-- Granularidade: uma linha por distribuidora (nacional, ja agregada entre as
-- regioes onde ela aparece - mesma decisao de escopo de 06/07/2026,
-- GRANULARIDADE = nacional por distribuidora, nao por UF/regiao).
--
-- amostra_pequena (< 1000 pedidos) e computada no backend a partir de
-- n_pedidos, nao persistida aqui - e derivada, nao dado bruto.

CREATE TABLE IF NOT EXISTS desempenho_conexao_distribuidoras (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  distribuidora varchar(150) NOT NULL,
  sig_agente_indqual varchar(60),
  regiao_principal varchar(20) NOT NULL,
  n_pedidos integer NOT NULL,
  n_regioes integer NOT NULL,
  pct_conectado double precision NOT NULL,
  prazo_confiavel boolean NOT NULL,
  pct_dentro_do_prazo double precision,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT desempenho_conexao_distribuidoras_nome_unico UNIQUE (distribuidora)
);

COMMENT ON TABLE desempenho_conexao_distribuidoras IS
  'Resumo tecnico nacional por distribuidora (desempenho de conexao de MMGD), persistido a partir do dataset ANEEL "Atendimento a pedidos de conexoes MMGD". Ver backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py para a metodologia completa e docs/DECISOES.md para as decisoes de exibicao do ranking publico.';
COMMENT ON COLUMN desempenho_conexao_distribuidoras.sig_agente_indqual IS
  'Nome da distribuidora casado com qualidade_conjuntos.sig_agente (schema INDQUAL), ja resolvido pelo extractor via crosswalk manual + automatico. NULL quando nao foi encontrado par - distribuidora fica no ranking tecnico mas SEM eixo de justica energetica (nunca tratar NULL como "0" ou "neutro").';
COMMENT ON COLUMN desempenho_conexao_distribuidoras.prazo_confiavel IS
  'false quando o campo DatLim (prazo regulatorio) esta praticamente ausente na fonte para esta distribuidora (< 50% de preenchimento entre pedidos conectados) - nestes casos pct_dentro_do_prazo fica NULL, NUNCA deve ser lido/exibido como "0% no prazo". Ver ARQUITETURA.md, "ACHADO CRITICO PARA ESTE PRODUTO".';
