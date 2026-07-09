-- Migration 0023: tabelas de escrita do papel Colaborador (RF-059 a RF-067)
--
-- MOTIVACAO (sessao 08/07/2026): fundacao de auth/RBAC (migration 0022) foi
-- implementada como pre-requisito explicito para os endpoints de escrita do
-- Colaborador (funde antigos P4 Parceiro Tecnico + P5 Equipe do Projeto -
-- ver DRF.md Secao 2). Escopo desta migration: as 5 tabelas de escrita do
-- Colaborador. Painel Admin (RF-068 a RF-077) fica em migration separada
-- (0024) - "nao misturar funcionalidades nao relacionadas" (CLAUDE.md, Secao 6).
--
-- base_dados usa os mesmos 6 IDs canonicos ja definidos em
-- basesDeDados.service.ts (RF-063): 'aneel', 'ibge', 'cadunico', 'tsee',
-- 'ivs_ipea', 'inpe'. Nao ha FK para uma tabela "bases_dados" porque essa
-- tabela nao existe - as fontes sao uma lista fixa hardcoded no service (ver
-- src/utils/basesDeDadosCanonicas.ts, criado nesta mesma sessao).

-- RF-059: status de revisao metodologica por base (1 linha por base -
-- diferente do status TECNICO de metadados_bases_dados na migration 0024,
-- que e do Administrador, nao do Colaborador).
CREATE TABLE IF NOT EXISTS revisoes_bases_dados (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  base_dados varchar(30) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'em_revisao',
  atualizado_por_usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT revisoes_bases_dados_base_unica UNIQUE (base_dados),
  CONSTRAINT revisoes_bases_dados_status_valido
    CHECK (status IN ('em_revisao', 'validado', 'inconsistencia_encontrada'))
);

COMMENT ON TABLE revisoes_bases_dados IS
  'RF-059: status de revisao metodologica por base de dados primaria, mantido pelo Colaborador. 1 linha por base (seed abaixo com as 6 bases canonicas).';

-- RF-060: historico de observacoes sobre inconsistencias (append-only).
CREATE TABLE IF NOT EXISTS observacoes_bases_dados (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  base_dados varchar(30) NOT NULL,
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mensagem text NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE observacoes_bases_dados IS
  'RF-060: registro de observacoes sobre inconsistencias encontradas em cruzamentos de dados. Append-only (historico), nao tem UPDATE/DELETE previsto no DRF.';

-- RF-061: sugestoes de melhoria em indicadores (append-only).
CREATE TABLE IF NOT EXISTS sugestoes_indicadores (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  indicador varchar(120) NOT NULL,
  mensagem text NOT NULL,
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE sugestoes_indicadores IS
  'RF-061: formulario de sugestao de melhoria em indicadores existentes. Append-only.';

-- RF-064/065/066: notas metodologicas COM HISTORICO (cada linha e uma nova
-- versao - "historico de revisoes" do RF-064 = multiplas linhas por topico,
-- ordenadas por criado_em; a mais recente e a "atual"). forca_achado e o
-- RF-066 ("classificacao visual da forca dos achados").
CREATE TABLE IF NOT EXISTS notas_metodologicas (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  topico varchar(80) NOT NULL,
  conteudo text NOT NULL,
  forca_achado integer,
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT notas_metodologicas_forca_achado_valida
    CHECK (forca_achado IS NULL OR forca_achado BETWEEN 1 AND 5)
);

COMMENT ON TABLE notas_metodologicas IS
  'RF-064/065: notas metodologicas com historico de revisao (cada linha = 1 versao, nunca UPDATE). RF-066: forca_achado (1-5, escala de estrelas), opcional.';
COMMENT ON COLUMN notas_metodologicas.topico IS
  'Texto livre, nao enum - ex: "obepe_indice_pobreza_energetica_regional" (RF-080), "granularidade_mmgd" (RF-065). Novos topicos nao exigem migration.';

-- RF-067: materiais de comunicacao em producao, com status.
CREATE TABLE IF NOT EXISTS materiais_comunicacao (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  titulo varchar(160) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'em_producao',
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT materiais_comunicacao_status_valido
    CHECK (status IN ('em_producao', 'em_revisao', 'publicado'))
);

COMMENT ON TABLE materiais_comunicacao IS
  'RF-067: area de preparacao de conteudo para relatorios/comunicacao publica, com status.';

-- Seed: 1 linha por base canonica em revisoes_bases_dados, status inicial
-- 'em_revisao' (nenhuma foi revisada ainda). IDs identicos aos hardcoded em
-- basesDeDados.service.ts (RF-063) - ver src/utils/basesDeDadosCanonicas.ts.
INSERT INTO revisoes_bases_dados (base_dados, status) VALUES
  ('aneel', 'em_revisao'),
  ('ibge', 'em_revisao'),
  ('cadunico', 'em_revisao'),
  ('tsee', 'em_revisao'),
  ('ivs_ipea', 'em_revisao'),
  ('inpe', 'em_revisao')
ON CONFLICT (base_dados) DO NOTHING;
