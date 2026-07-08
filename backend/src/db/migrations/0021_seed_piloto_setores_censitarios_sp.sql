-- Migration 0021: seed piloto de setores censitarios ilustrativos - Sao Paulo (RF-045)
--
-- RF-045: "simular, exclusivamente para fins de prototipagem, um cenario
-- piloto de dado sub-municipal para o municipio de Sao Paulo (SP), em
-- granularidade de setor censitario, sinalizado com texto indicando se
-- tratar de 'Cenario ilustrativo - dado piloto aguardando granularidade
-- real da ANEEL'".
--
-- Este NAO e dado real da ANEEL/IBGE - e um seed SINTETICO so pra
-- prototipagem do drill-down RF-043 ("Ver detalhamento interno"). Usa
-- ST_SquareGrid (nativo do PostGIS 3.4+, ja usado neste projeto -
-- postgis/postgis:16-3.4) para subdividir a geometria REAL de Sao Paulo
-- numa grade de celulas quadradas de 6km, mantém só as células que de fato
-- intersectam o polígono do município (a grade cobre o bounding box
-- inteiro, maior que o contorno real) e recorta cada célula pela geometria
-- real (ST_Intersection) pra não "vazar" fora do contorno municipal no mapa.
--
-- DISTRIBUICAO ILUSTRATIVA: divide a potencia residencial e o numero de UCs
-- REAIS de Sao Paulo (mmgd_indicadores, snapshot mais recente) proporcional
-- à área de cada setor sintético - SEM aleatoriedade, de propósito (menos
-- superfície pra bug numa migration que não dá pra testar antes de rodar
-- contra o banco real). A soma dos setores pode divergir ligeiramente do
-- total real por causa de arredondamento - irrelevante, já que o dado é
-- ilustrativo por definição (RF-045 pede isso explicitamente).
--
-- Cada linha marcada com e_dado_ilustrativo = 'true' em mmgd_indicadores
-- (coluna que já existia no schema desde a v1 exatamente para este caso -
-- ver mmgd_indicadores.ts). IDEMPOTENTE: apaga qualquer seed anterior deste
-- piloto antes de recriar, então pode rodar mais de uma vez sem duplicar.

DO $$
DECLARE
  v_codigo_ibge CHAR(7) := '3550308';
  v_geom_municipio geometry;   -- geometria original, SRID 4674 (graus, SIRGAS 2000)
  v_geom_municipio_m geometry; -- mesma geometria reprojetada p/ EPSG:3857 (metros) -
                                -- necessario pro ST_SquareGrid, que interpreta o
                                -- parametro de tamanho na UNIDADE do SRID recebido
                                -- (em graus, "6000" seria um erro grosseiro de escala)
  v_potencia_residencial_real double precision;
  v_numero_ucs_residencial_real integer;
  v_periodo_referencia date;
  v_total_area double precision := 0;
  v_setor RECORD;
  v_contador integer := 0;
BEGIN
  SELECT geom INTO v_geom_municipio FROM municipios WHERE codigo_ibge = v_codigo_ibge;

  IF v_geom_municipio IS NULL THEN
    RAISE EXCEPTION 'Municipio % nao encontrado - seed piloto RF-045 abortado.', v_codigo_ibge;
  END IF;

  v_geom_municipio_m := ST_Transform(v_geom_municipio, 3857);

  SELECT mi.potencia_residencial_kw, mi.numero_ucs_residencial, mi.periodo_referencia
    INTO v_potencia_residencial_real, v_numero_ucs_residencial_real, v_periodo_referencia
  FROM mmgd_indicadores mi
  JOIN unidades_espaciais ue ON ue.id = mi.unidade_espacial_id
  WHERE ue.municipio_pai_codigo_ibge = v_codigo_ibge AND ue.tipo = 'municipio'
  ORDER BY mi.periodo_referencia DESC
  LIMIT 1;

  IF v_potencia_residencial_real IS NULL THEN
    RAISE EXCEPTION 'Sao Paulo sem potencia_residencial_kw carregada - rode extrair_mmgd_aneel.py (migration 0020) antes deste seed.';
  END IF;

  -- Idempotência: remove qualquer seed anterior deste piloto antes de recriar.
  DELETE FROM mmgd_indicadores WHERE unidade_espacial_id IN (
    SELECT id FROM unidades_espaciais
    WHERE municipio_pai_codigo_ibge = v_codigo_ibge AND tipo = 'setor_censitario'
      AND id LIKE 'setor_censitario:piloto_sp_%'
  );
  DELETE FROM unidades_espaciais
  WHERE municipio_pai_codigo_ibge = v_codigo_ibge AND tipo = 'setor_censitario'
    AND id LIKE 'setor_censitario:piloto_sp_%';

  -- Grade gerada e recortada em EPSG:3857 (metros — "6000" aqui É 6km de
  -- verdade), resultado reprojetado de volta para 4674 (SIRGAS 2000, mesmo
  -- SRID de todas as outras geometrias do Atlas — CLAUDE.md, Seção 5) antes
  -- de calcular área/gravar. Área calculada via ::geography (sempre em cima
  -- da geometria já em 4674, mesmo padrão já usado no resto do projeto).
  CREATE TEMPORARY TABLE tmp_setores_piloto ON COMMIT DROP AS
  SELECT
    row_number() OVER () AS idx,
    ST_Transform(ST_Intersection(v_geom_municipio_m, grade.geom), 4674) AS geom_recortada,
    ST_Area(ST_Transform(ST_Intersection(v_geom_municipio_m, grade.geom), 4674)::geography) / 1000000.0 AS area_km2
  FROM ST_SquareGrid(6000, v_geom_municipio_m) AS grade
  WHERE ST_Intersects(v_geom_municipio_m, grade.geom)
    AND ST_Area(ST_Intersection(v_geom_municipio_m, grade.geom)) > 10000; -- 10.000 m² = 0,01 km² (filtro grosseiro em metros/3857, só pra descartar fatias residuais antes do cálculo preciso em geography acima)

  SELECT SUM(area_km2) INTO v_total_area FROM tmp_setores_piloto;

  IF v_total_area IS NULL OR v_total_area = 0 THEN
    RAISE EXCEPTION 'ST_SquareGrid nao gerou nenhuma celula valida para Sao Paulo - seed piloto RF-045 abortado.';
  END IF;

  FOR v_setor IN SELECT * FROM tmp_setores_piloto ORDER BY idx LOOP
    v_contador := v_contador + 1;

    INSERT INTO unidades_espaciais (id, tipo, codigo_original, nome_exibicao, municipio_pai_codigo_ibge, geom, area_km2)
    VALUES (
      'setor_censitario:piloto_sp_' || lpad(v_contador::text, 3, '0'),
      'setor_censitario',
      'piloto_sp_' || lpad(v_contador::text, 3, '0'),
      'Setor Censitário Ilustrativo ' || v_contador || ' (São Paulo — piloto RF-045)',
      v_codigo_ibge,
      v_setor.geom_recortada,
      v_setor.area_km2
    );

    INSERT INTO mmgd_indicadores (
      unidade_espacial_id, periodo_referencia, potencia_instalada_kw, numero_ucs_com_mmgd,
      potencia_residencial_kw, numero_ucs_residencial, e_dado_ilustrativo
    )
    VALUES (
      'setor_censitario:piloto_sp_' || lpad(v_contador::text, 3, '0'),
      v_periodo_referencia,
      round((v_potencia_residencial_real * (v_setor.area_km2 / v_total_area))::numeric, 2),
      GREATEST(1, round(v_numero_ucs_residencial_real * (v_setor.area_km2 / v_total_area))::integer),
      round((v_potencia_residencial_real * (v_setor.area_km2 / v_total_area))::numeric, 2),
      GREATEST(1, round(v_numero_ucs_residencial_real * (v_setor.area_km2 / v_total_area))::integer),
      'true'
    );
  END LOOP;

  RAISE NOTICE 'Seed piloto RF-045: % setores censitarios ilustrativos criados para Sao Paulo (area total % km2).', v_contador, round(v_total_area::numeric, 2);
END $$;
