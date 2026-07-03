-- ============================================================
-- Eixo: Qualidade do Fornecimento (INDQUAL)
-- Fonte: ANEEL Dados Abertos
--   - Indicadores Coletivos de Continuidade (DEC e FEC)
--     https://dadosabertos.aneel.gov.br/dataset/indicadores-coletivos-de-continuidade-dec-e-fec
--   - IndQual Município (chave de ligação conjunto <-> município)
--     https://dadosabertos.aneel.gov.br/dataset/indqual-municipio
--
-- Arquitetura: normalizada. Conjunto Elétrico é a unidade nativa dos
-- dados da ANEEL; município é resolvido via tabela de junção N:N
-- (um conjunto pode cobrir vários municípios, e vice-versa).
-- ============================================================

-- Conjuntos elétricos (unidade de apuração da ANEEL)
CREATE TABLE IF NOT EXISTS qualidade_conjuntos (
    ide_conjunto    VARCHAR(20) PRIMARY KEY,
    sig_agente      VARCHAR(20),
    num_cnpj        VARCHAR(20),
    dsc_conjunto    VARCHAR(255),
    atualizado_em   TIMESTAMP NOT NULL DEFAULT now()
);

-- Valores dos indicadores, em formato longo (genérico para qualquer
-- SigIndicador presente no domínio: DEC, FEC, e futuros)
CREATE TABLE IF NOT EXISTS qualidade_indicadores (
    id                  BIGSERIAL PRIMARY KEY,
    ide_conjunto        VARCHAR(20) NOT NULL REFERENCES qualidade_conjuntos(ide_conjunto),
    sig_indicador       VARCHAR(20) NOT NULL,
    ano_indice          SMALLINT NOT NULL,
    num_periodo_indice  SMALLINT NOT NULL,
    vlr_indice          NUMERIC(14,4),
    atualizado_em       TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (ide_conjunto, sig_indicador, ano_indice, num_periodo_indice)
);

CREATE INDEX IF NOT EXISTS idx_qualidade_indicadores_lookup
    ON qualidade_indicadores (sig_indicador, ano_indice);

-- Domínio de siglas de indicador (DEC, FEC, ...), carga de referência
CREATE TABLE IF NOT EXISTS qualidade_dominio_indicadores (
    sig_indicador   VARCHAR(20) PRIMARY KEY,
    dsc_indicador   TEXT
);

-- Junção N:N conjunto <-> município
CREATE TABLE IF NOT EXISTS qualidade_conjunto_municipio (
    ide_conjunto    VARCHAR(20) NOT NULL REFERENCES qualidade_conjuntos(ide_conjunto),
    codigo_ibge     CHARACTER(7) NOT NULL REFERENCES municipios(codigo_ibge) ON DELETE CASCADE,
    PRIMARY KEY (ide_conjunto, codigo_ibge)
);

CREATE INDEX IF NOT EXISTS idx_qcm_municipio
    ON qualidade_conjunto_municipio (codigo_ibge);

-- ============================================================
-- VIEW: valores por município, resolvendo o N:N.
-- Regra padrão: pior caso (MAX) entre os conjuntos que cobrem o
-- município, alinhado ao enquadramento de justiça energética
-- (a média poderia mascarar bolsões de má qualidade). A média
-- simples também fica disponível na mesma view para referência.
-- ============================================================
CREATE OR REPLACE VIEW vw_qualidade_municipio AS
SELECT
    qcm.codigo_ibge,
    qi.sig_indicador,
    qi.ano_indice,
    qi.num_periodo_indice,
    MAX(qi.vlr_indice)              AS vlr_pior_caso,
    AVG(qi.vlr_indice)              AS vlr_medio,
    COUNT(DISTINCT qi.ide_conjunto) AS qtd_conjuntos
FROM qualidade_indicadores qi
JOIN qualidade_conjunto_municipio qcm ON qcm.ide_conjunto = qi.ide_conjunto
GROUP BY qcm.codigo_ibge, qi.sig_indicador, qi.ano_indice, qi.num_periodo_indice;