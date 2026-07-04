-- Migration 0011: DEC/FEC "real" (sem expurgo de Dia Critico)
-- DEC/FEC oficial da ANEEL exclui ocorrencias em "Dia Critico" (NT 071/2011-SRD/ANEEL).
-- As parcelas expurgadas (sufixo "C": *INC, *IPC, *XNC, *XPC) ja estao carregadas em
-- qualidade_indicadores. Esta migration apenas cria views para soma-las de volta.
-- Nao requer nova extracao de dados.

CREATE OR REPLACE VIEW vw_qualidade_conjunto_real AS
SELECT
    ide_conjunto,
    ano_indice,
    num_periodo_indice,
    SUM(vlr_indice) FILTER (WHERE sig_indicador = 'DEC') AS dec_oficial,
    COALESCE(SUM(vlr_indice) FILTER (
        WHERE sig_indicador IN ('DECINC', 'DECIPC', 'DECXNC', 'DECXPC')
    ), 0) AS dec_expurgado,
    SUM(vlr_indice) FILTER (WHERE sig_indicador = 'DEC')
        + COALESCE(SUM(vlr_indice) FILTER (
            WHERE sig_indicador IN ('DECINC', 'DECIPC', 'DECXNC', 'DECXPC')
        ), 0) AS dec_real,
    SUM(vlr_indice) FILTER (WHERE sig_indicador = 'FEC') AS fec_oficial,
    COALESCE(SUM(vlr_indice) FILTER (
        WHERE sig_indicador IN ('FECINC', 'FECIPC', 'FECXNC', 'FECXPC')
    ), 0) AS fec_expurgado,
    SUM(vlr_indice) FILTER (WHERE sig_indicador = 'FEC')
        + COALESCE(SUM(vlr_indice) FILTER (
            WHERE sig_indicador IN ('FECINC', 'FECIPC', 'FECXNC', 'FECXPC')
        ), 0) AS fec_real
FROM qualidade_indicadores
WHERE sig_indicador IN (
    'DEC', 'DECINC', 'DECIPC', 'DECXNC', 'DECXPC',
    'FEC', 'FECINC', 'FECIPC', 'FECXNC', 'FECXPC'
)
GROUP BY ide_conjunto, ano_indice, num_periodo_indice;

CREATE OR REPLACE VIEW vw_qualidade_municipio_real AS
SELECT
    qcm.codigo_ibge,
    qcr.ano_indice,
    qcr.num_periodo_indice,
    MAX(qcr.dec_real) AS dec_real_pior_caso,
    AVG(qcr.dec_real) AS dec_real_medio,
    MAX(qcr.fec_real) AS fec_real_pior_caso,
    AVG(qcr.fec_real) AS fec_real_medio,
    COUNT(DISTINCT qcr.ide_conjunto) AS qtd_conjuntos
FROM vw_qualidade_conjunto_real qcr
JOIN qualidade_conjunto_municipio qcm
    ON qcm.ide_conjunto::text = qcr.ide_conjunto::text
GROUP BY qcm.codigo_ibge, qcr.ano_indice, qcr.num_periodo_indice;
