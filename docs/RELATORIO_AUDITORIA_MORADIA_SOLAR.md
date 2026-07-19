# Relatório de Auditoria Analítica e Diagnóstico Estratégico
## A Condição de Moradia como Eixo Transversal do Acesso à Energia Solar Distribuída

**Atlas Solar Justo — Instituto Pólis**
Elaborado por: Cientista de Dados Chefe / Arquitetura de Soluções Estratégicas
Data de referência: 18/07/2026 (estado do motor de dados após migration `0027`)
Escopo: auditoria do banco de dados (PostgreSQL + PostGIS, Drizzle ORM) e da camada de serviços (Node/Express) — **não** da interface visual, hoje mais limitada que a arquitetura de dados que a sustenta.

---

## Sumário Executivo

O Atlas Solar Justo não foi construído como "um mapa de energia solar com uma camada social a mais". A auditoria do schema, das views consolidadas e dos extractors confirma que a arquitetura foi montada — desde as primeiras migrations — para responder a uma pergunta estruturalmente diferente da que orienta a maior parte dos observatórios de energia: não "onde há irradiação e onde há adoção", mas **onde a condição de moradia permite, ou impede, que a irradiação e a renda disponíveis se convertam em um telhado com placas solares**.

Esta auditoria confirma que o banco sustenta essa leitura com rigor estatístico: normalização per capita para não confundir porte populacional com padrão de acesso, mediana (não média) para lidar com distribuições assimétricas, política de ausência justificada de dado (nunca "—" lido como zero), e um índice de precariedade habitacional calculado **deliberadamente em separado** do IVS geral — decisão de arquitetura registrada na migration `0015`, cujo motivo (preservar a hipótese moradia×MMGD sem diluição) é, paradoxalmente, também a principal lacuna de priorização do sistema hoje: **o ranking de Vazios de Acesso usa o IVS geral, que não inclui moradia**. A Seção 3 propõe como fechar essa lacuna sem redesenhar o schema.

A auditoria também corrige três pontos onde a premissa de trabalho estava desatualizada em relação ao código: cobertura real de ZEIS/AEIS (8 municípios, não 4), natureza sintética — não real — do piloto de setor censitário de São Paulo, e a granularidade estritamente municipal (sem chave de indivíduo/domicílio) do cruzamento MCMV × Reforma Casa Brasil Solar. Tratar essas lacunas com transparência é, em si, parte do argumento estratégico deste documento: um observatório que serve política pública perde credibilidade no exato momento em que esconde os limites do proxy que usa.

---

## 1. A Lente Estratégica: Moradia como Pré-Condição, Não como Mais um Indicador

A maioria dos observatórios de energia solar distribuída no Brasil — inclusive os produzidos pela própria ANEEL — lê o problema de adoção por dois eixos: **potencial físico** (irradiação) e **capacidade econômica** (renda, tarifa). Nessa leitura, um município com sol abundante e renda média razoável "deveria" ter adoção alta; se não tem, presume-se fricção regulatória (fila de conexão, tarifa) ou déficit de informação.

O Atlas Solar Justo, por desenho, insere um terceiro eixo antes dos outros dois — e, na leitura institucional do Pólis, o eixo condicionante: **a edificação em si comporta a tecnologia?** Isso aparece de forma explícita e documentada em pelo menos três pontos do código, não como interpretação retrospectiva:

- O extractor [`extrair_inadequacao_moradia.py`](../backend/src/etl/loaders/extrair_inadequacao_moradia.py) declara a tese no próprio docstring: *"Acesso à MMGD não depende apenas de renda. Depende também da condição de moradia — neste caso especificamente, da CAPACIDADE FÍSICA da edificação de receber a instalação de um sistema solar. Domicílios com paredes inadequadas (...) tendem a ter telhados/estruturas igualmente precárias, o que dificulta a instalação de MMGD no modelo individual e sugere que a resposta para esses territórios pode ser geração compartilhada/comunitária, não instalação domiciliar isolada."* Este é o núcleo do argumento do Pólis codificado como comentário de engenharia, não como retórica de relatório.
- A normalização por MMGD **residencial** per capita (não o total) — [`municipios.service.ts:59-60`](../backend/src/services/municipios.service.ts) e a metodologia de Vazios de Acesso em [`vaziosDeAcesso.service.ts:12-17`](../backend/src/services/vaziosDeAcesso.service.ts) — existe precisamente para isolar o padrão de adoção **domiciliar** (o que depende de telhado, posse, estrutura) do padrão agroindustrial (irrigação, agronegócio), que responde a uma lógica de investimento completamente diferente e mascararia o sinal habitacional se fosse somado.
- A migration `0014` cria um **Índice de Segurança da Posse** (proprio=1,0 / alugado=0,5 / cedido=0,0) e um **Índice de Precariedade Habitacional** (cortiço + parede inadequada + população em favela) como objetos de primeira classe do schema — não derivados ad hoc em uma consulta pontual, mas materializados em view (`vw_indices_compostos_moradia_infraestrutura`) para consumo recorrente por qualquer análise futura.

O efeito prático dessa lente: um município de alta irradiação e renda mediana, mas com alta informalidade fundiária (posse cedida/precária) ou alta proporção de domicílios com parede inadequada, é lido pelo Atlas como uma barreira **estrutural**, não uma barreira de mercado. Programas de crédito, subsídio tarifário ou campanha de informação não resolvem esse gargalo — porque a barreira não é "a pessoa não sabe ou não pode pagar", é "o telhado sobre a cabeça dessa pessoa não é dela, ou não aguenta o peso do sistema". Essa distinção é exatamente o tipo de diagnóstico que separa uma política energética de uma política habitacional-energética integrada — a proposta de valor central do Pólis nesta plataforma.

---

## 2. Inventário de Cruzamentos Possíveis

O banco permite, hoje, os cinco cruzamentos solicitados — com graus de maturidade distintos. Cada um é descrito com as tabelas/views envolvidas, o desenho analítico e as ressalvas que a própria arquitetura já antecipa.

### 2.1 Penetração de MMGD residencial per capita dentro vs. fora de perímetros ZEIS/AEIS

**Maturidade: alta para as capitais cobertas; não generalizável nacionalmente.**

Fonte: 8 seeds municipais de ZEIS/AEIS — São Paulo, Recife, Rio Branco, Rio de Janeiro (cobertura original), mais Contagem, Salvador, Fortaleza e Belo Horizonte (adicionados em commit `9c29c8e`, já presente no histórico atual — **correção de premissa**: o pedido original menciona 4 capitais; a cobertura real já é o dobro disso). Cada perímetro é uma `unidade_espacial` com `tipo` próprio, geometria poligonal real recortada da malha municipal.

Desenho do cruzamento: para cada uma das 8 capitais, uma junção espacial (`ST_Intersects`/`ST_Within`) entre a geometria de MMGD residencial disponível na granularidade mais fina existente naquele município (hoje, município inteiro — ver ressalva 4.1) e o polígono ZEIS/AEIS produz duas populações comparáveis: "dentro do perímetro" vs. "fora, mesmo município". Como a MMGD residencial ainda não está desagregada em nível de perímetro/bairro na maioria dessas 8 capitais (só São Paulo tem o piloto de setor, e sintético — ver Seção 4), o cruzamento hoje é necessariamente qualitativo/estrutural: **presença de perímetro ZEIS como covariável municipal** (dummy 0/1, ou % de área municipal em ZEIS) correlacionada ao MMGD residencial per capita municipal, controlando por irradiação e renda. Não é ainda o cruzamento fino "dentro do perímetro" desejado — essa é uma fronteira de expansão real (ver 4.1), não uma limitação escondida.

### 2.2 Adoção solar em municípios de alta inadequação/déficit habitacional vs. baixa, controlando por irradiação

**Maturidade: alta — todos os componentes já existem em view consolidada.**

Este é o cruzamento estatisticamente mais robusto disponível hoje, porque não depende de granularidade sub-municipal — opera inteiramente no nível município, onde a cobertura é nacional (~5.570 municípios). Insumos:

- Eixo de controle (irradiação): `irradiacao_solar.irradiacao_media_kwh_m2_dia` (Atlas INPE/LABREN, 1999–2015).
- Eixo de inadequação habitacional: `vw_indices_compostos_moradia_infraestrutura.indice_precariedade_moradia` (média normalizada min-max de `percentual_cortico`, `percentual_parede_inadequada`, `percentual_populacao_favela` — migration `0014`).
- Eixo de resposta: `mmgd_indicadores.potencia_residencial_kw` / `numero_ucs_residencial`, normalizados per capita.

Desenho analítico recomendado: regressão (ou, na ausência de infraestrutura estatística no backend hoje, correlação parcial replicando o padrão já usado em `backend/src/etl/analises/analisar_correlacao_mmgd_renda.py`) de MMGD residencial per capita sobre `indice_precariedade_moradia`, controlando por irradiação e renda média domiciliar. A hipótese do Pólis prevê coeficiente negativo e estatisticamente robusto para precariedade habitacional **mesmo depois de controlar irradiação e renda** — se confirmado, é a evidência quantitativa central de que moradia é uma barreira independente, não um proxy redundante de pobreza.

**Ressalva já registrada no código-fonte, não inventada para este relatório**: o próprio `vaziosDeAcesso.service.ts` (linhas 28-33) alerta que parte da concentração observada de Vazios de Acesso no Nordeste reflete o "gargalo de renda documentado alhures, não só potencial solar desperdiçado" — o mesmo cuidado metodológico se aplica aqui: qualquer leitura do coeficiente de precariedade habitacional deve reportar o modelo controlado, nunca a correlação bivariada isolada.

### 2.3 Sobreposição entre beneficiários de MCMV (FGTS/OGU) e do Reforma Casa Brasil Solar

**Maturidade: municipal-agregada apenas — não há chave de indivíduo/domicílio para vincular os dois programas.**

Insumos: `indicadores_sociais.unidades_habitacionais_fgts`, `.empreendimentos_ogu` / `.unidades_ogu_previstas` / `.unidades_ogu_entregues` (MCMV) versus `.numero_contratos_reforma_casa_brasil_solar` / `.valor_liberado_reforma_casa_brasil_solar` (migration `0027`).

O extractor [`extrair_reforma_casa_brasil_solar.py`](../backend/src/etl/loaders/extrair_reforma_casa_brasil_solar.py) documenta explicitamente que a fonte (extrato pontual do sistema interno da Caixa, PDF, **não pública/automatizável** — a única fonte do Atlas nessa condição) chega em "agregado único por município" — sem CPF, sem número de contrato individual, sem endereço. Isso significa que o cruzamento tecnicamente correto e honesto é de **co-ocorrência municipal**, não de "mesmo domicílio recebeu os dois benefícios": para cada município, comparar se ele está simultaneamente no grupo com unidades MCMV entregues E no grupo com contratos Reforma Casa Brasil Solar, versus municípios com um benefício mas não o outro. Isso já responde à pergunta estratégica mais importante do item 3.3 (eficácia/redundância territorial do programa) sem exigir uma alegação de nível individual que o dado não sustenta.

Cobertura real do extrato usado, validada nesta sessão: 1.093 municípios, 3.253 contratos, R$ 61.377.571,09 liberados, período nov/2025–abr/2026 (6 meses, sem série temporal — mesmo padrão de `unidades_habitacionais_fgts`).

### 2.4 Presença de favela (FCU) como preditor de Vazio de Acesso mesmo em alta irradiação/tarifa elevada

**Maturidade: alta — é o cruzamento que mais diretamente testa a tese central do Pólis.**

A classificação de Vazio de Acesso (`vaziosDeAcesso.service.ts`) já produz, para cada município, o quadrante bivariado irradiação × MMGD residencial per capita (mediana nacional como corte) e associa a ele `ivs`, `renda_media_domiciliar` e `percentual_pobreza_cadunico`. O cruzamento pedido — favela como preditor **mesmo controlando tarifa e irradiação altas** — é o subconjunto mais informativo dessa classificação: filtrar os municípios classificados como `vazio_de_acesso` cuja `irradiacao_media_kwh_m2_dia` está no quartil superior nacional **e** cuja `tarifa_energia_residencial` também está no quartil superior (ou seja, o caso em que a explicação "tarifa alta desestimula investimento" e "pouco sol" já foram descartadas por desenho), e testar se `percentual_populacao_favela` / `numero_favelas_comunidades` diferencia esse subconjunto do restante dos vazios.

Se confirmado — e a arquitetura de dados já permite rodar esse teste hoje, sem nenhuma migration nova — este é o resultado mais forte que o Atlas pode produzir para o argumento institucional do Pólis: existem territórios onde **nem irradiação nem tarifa explicam a não-adoção**; a variável que resta, e que só o Atlas (entre observatórios de energia) mede de forma explícita, é a condição de moradia informal.

### 2.5 Índice composto de moradia e infraestrutura como componente do IVS na priorização de ranking

**Correção de premissa — este cruzamento não existe hoje, por decisão de arquitetura documentada, não por lacuna de implementação.**

A migration `0015` é explícita: *"Moradia (seguranca da posse, cortico, favela) FICA FORA deste IVS de proposito -- e o eixo separado calculado na migration 0014 (...), mantido a parte para permitir testar a hipotese 'MMGD x Seguranca da Posse' isoladamente, sem diluir no IVS geral."* O `vw_ivs_consolidado` é composto apenas por 3 blocos: Infraestrutura Urbana (água/esgoto/lixo/rural), Renda e Trabalho, Capital Humano (alfabetização/mortalidade infantil). Moradia (`indice_precariedade_moradia`, `indice_seguranca_posse`) é uma view separada (`vw_indices_compostos_moradia_infraestrutura`), e é **esse** IVS-sem-moradia que hoje alimenta a priorização padrão de Vazios de Acesso (RF-056).

Essa não é uma falha — é uma decisão metodológica correta *para o propósito com que foi tomada* (evitar que testar "MMGD × moradia" vire uma tautologia, já que o preditor estaria dentro do próprio índice de priorização). Mas ela deixa uma lacuna de produto real: hoje, o Pólis não tem, com um clique, um ranking "onde a vulnerabilidade habitacional-energética é mais aguda" — só um ranking de vulnerabilidade geral (IVS) e, separadamente, um índice de precariedade habitacional. A Seção 3.1 propõe como fechar essa lacuna sem violar a separação metodológica que a migration `0015` documenta corretamente.

---

## 3. Insights e Diagnósticos Estratégicos Imediatos

### 3.1 Vulnerabilidade sócio-habitacional-energética: a métrica que faltava — IMPLEMENTADA em 18/07/2026

O achado da Seção 2.5 apontava para a proposta mais concreta deste relatório: um **IVSH — Índice de Vulnerabilidade Sócio-Habitacional-Energética** — calculado como uma *segunda* view de priorização, não uma alteração do IVS existente. Após os resultados da Seção 3.3 confirmarem a hipótese com dado real, o IVSH foi implementado nesta mesma sessão:

```
IVSH = média( IVS_consolidado.ivs_calculado,
              indices_compostos_moradia.indice_precariedade_moradia,
              1 − indice_seguranca_posse/100 )
```

**Implementação**: migration [`0028_view_ivsh_consolidado.sql`](../backend/src/db/migrations/0028_view_ivsh_consolidado.sql), criando `vw_ivsh_consolidado` sem alterar `vw_ivs_consolidado` nem `vw_indices_compostos_moradia_infraestrutura` — a separação analítica que a migration `0015` protege continua intacta; o IVSH é uma terceira view, de uso exclusivo para priorização. `ivsh` foi adicionado como novo valor aceito em `ordenarPor` no schema Zod de `GET /api/vazios-de-acesso` (`CRITERIOS_ORDENACAO`, [`vaziosDeAcesso.schema.ts`](../backend/src/schemas/vaziosDeAcesso.schema.ts)) e propagado por `vaziosDeAcesso.service.ts` (novo campo `ivsh` em `MunicipioClassificado`, join com a view na consulta de `buscarPainelBruto`).

**Validado nesta sessão**: migration aplicada no banco local (5.573 municípios com IVSH calculado, média nacional 0,2095, min 0, max 0,387), `tsc --noEmit` do backend limpo, e teste ao vivo do endpoint (`GET /api/vazios-de-acesso?ordenarPor=ivsh&ordem=desc`) — os 5 municípios de maior IVSH (Alto Alegre/RR, Amajari/RR, Uiramutã/RR, Marajá do Sena/MA, Cumaru do Norte/PA) incluem 3 já classificados como `vazio_de_acesso`, confirmando sinal coerente com a classificação existente sem ser redundante com ela (os outros 2 são `baixo_potencial_baixa_adocao` — o IVSH capta vulnerabilidade mesmo fora do quadrante de potencial solar desperdiçado, o que é esperado: são dimensões parcialmente independentes, como a Seção 3.3 demonstrou).

### 3.2 Descompasso morfológico: onde o potencial solar existe mas a moradia não o comporta

Cruzando `irradiacao_solar` (eixo físico) com `indice_precariedade_moradia` (eixo estrutural) — **sem** ainda olhar para MMGD —, é possível pré-mapear, de forma preditiva, onde a instalação domiciliar individual tende a falhar antes mesmo de ela não acontecer: alta irradiação + alto `percentual_parede_inadequada`/`percentual_cortico` marca território onde o próprio insumo físico da moradia (telhado, estrutura, parede) provavelmente não sustenta um sistema fotovoltaico individual, independentemente de qualquer política de crédito ou tarifa. Este é o argumento técnico mais direto para a recomendação, já presente no docstring do extractor de inadequação habitacional, de que a resposta correta nesses territórios é **geração compartilhada/comunitária**, não subsídio a instalação individual — uma politica pública fundamentalmente diferente, e mais barata de escalar, do que "dar desconto para comprar placa".

Adicionalmente, o índice de verticalização (`percentual_apartamento`, migration `0016`) permite refinar esse mapa: alta verticalização + alta irradiação é um segundo padrão de descompasso morfológico (telhado compartilhado, condomínio, decisão coletiva de instalação), estruturalmente distinto do descompasso por precariedade construtiva — os dois exigem desenho de política diferente (regulação de autoconsumo em condomínio vs. programa de reforma+solar).

### 3.3 Eficácia do Reforma Casa Brasil Solar frente ao mapa de Vazios de Acesso — RESULTADOS EXECUTADOS (18/07/2026)

Esta era a pergunta de auditoria de política pública mais direta que o Atlas podia responder com os dados já carregados. As três consultas foram executadas nesta sessão diretamente contra o banco local (réplica fiel, em SQL, da metodologia de `vaziosDeAcesso.service.ts` — medianas nacionais, mesma regra de exclusão de municípios pendentes de reextração de MMGD residencial), sobre a base completa de 5.569 municípios classificados (1.093 com contrato Reforma Casa Brasil Solar, 4.476 sem).

**A) Distribuição de quadrante — municípios COM contrato vs. SEM contrato**

| Quadrante | Com contrato RCBS (n=1.093) | Sem contrato RCBS (n=4.476) |
|---|---|---|
| Acesso pleno | **34,5%** (377) | 21,4% (957) |
| Adoção acima do potencial | 29,6% (324) | 25,2% (1.127) |
| Baixo potencial, baixa adoção | 15,1% (165) | 26,1% (1.168) |
| **Vazio de Acesso** | **20,8%** (227) | **27,3%** (1.224) |

**Achado 1 — o programa está proporcionalmente mais presente onde a MMGD residencial já é alta, não onde ela é mais escassa.** Municípios com contrato têm quase o dobro de chance relativa de estar em "Acesso pleno" (34,5% vs. 21,4%) e proporção sensivelmente menor de "Vazio de Acesso" (20,8% vs. 27,3%) do que municípios sem contrato. Isso não significa que o programa "escolhe" municípios com MMGD alta — mais provavelmente reflete capacidade institucional/bancária correlacionada (municípios que já têm alguma infraestrutura de adoção solar residencial tendem a ser os mesmos com capacidade administrativa de operacionalizar financiamento habitacional via Caixa). De qualquer forma, o efeito líquido observado é de reforço, não de correção, do padrão espacial de acesso solar já existente.

**B) Valor liberado per capita (R$ / 1.000 hab.) por quadrante, só entre os 1.093 municípios com contrato**

| Quadrante | Valor médio per capita | Total liberado |
|---|---|---|
| Acesso pleno | R$ 2.033,24 | R$ 23.113.392,22 |
| Adoção acima do potencial | R$ 2.441,27 | R$ 23.204.340,11 |
| Baixo potencial, baixa adoção | R$ 1.080,59 | R$ 6.469.348,51 |
| **Vazio de Acesso** | **R$ 1.410,93** | R$ 8.590.490,25 |

**Achado 2 — quando o programa chega a um Vazio de Acesso, chega com menos intensidade per capita do que chega aos municípios já bem servidos.** R$ 1.410,93/1.000 hab. nos vazios é 31% menor que nos municípios de "Adoção acima do potencial" (R$ 2.441,27) e 30% menor que em "Acesso pleno" (R$ 2.033,24). O padrão de A se repete em B: não é só menos frequente, é também menos intenso.

**C) Índice de precariedade de moradia (`vw_indices_compostos_moradia_infraestrutura.indice_precariedade_moradia`, normalizado 0–1 nacionalmente)**

| Recorte | Com contrato RCBS | Sem contrato RCBS |
|---|---|---|
| Base completa | 0,0259 (n=1.093) | 0,0153 (n=4.480) |
| Só dentro de Vazio de Acesso | 0,0281 (n=227) | 0,0186 (n=1.224) |

**Achado 3 — mais sutil e o mais importante metodologicamente: dentro de qualquer recorte, municípios com contrato têm precariedade habitacional média ~70% (base completa) a ~51% (dentro dos vazios) MAIOR que os sem contrato.** Ou seja, o programa parece, sim, ter alguma correlação positiva com precariedade habitacional — na direção que o desenho do programa (reforma + solar) sugeriria. Mas essa correlação é **ortogonal** ao eixo que classifica Vazio de Acesso (irradiação × MMGD residencial per capita): o programa correlaciona com moradia precária, mas isso não se traduz em maior presença nos municípios que o Atlas classifica como prioritários por potencial solar desperdiçado.

**Leitura consolidada dos três achados**: o Reforma Casa Brasil Solar não parece seguir nem ignorar completamente o critério de vulnerabilidade — ele responde a uma lógica própria (provavelmente ligada a onde a Caixa já opera reforma habitacional, e correlacionada com precariedade construtiva) que **não coincide** com a lógica de Vazio de Acesso do Atlas (potencial solar × adoção residencial). Isso é evidência direta e quantitativa de que precariedade habitacional e "vazio de acesso solar" são dimensões parcialmente independentes de vulnerabilidade — exatamente o argumento que sustenta a proposta do IVSH (Seção 3.1): sem um índice que combine as duas, qualquer priorização feita só por um dos dois eixos deixa passar parte real da vulnerabilidade territorial. **Este resultado confirma a hipótese de trabalho** e recomenda-se prosseguir com a implementação do IVSH como próximo passo técnico.

---

## 4. Limitações e o Uso de Proxies — Fronteiras de Expansão

Um observatório que serve formulação de política perde autoridade no momento em que trata proxy como medida direta. Esta seção documenta, com a mesma disciplina que o próprio código já aplica (ver política de "ausência justificada de dado" em `frontend/src/utils/notasAusencia.ts`), onde o Atlas usa proxy e por quê isso é uma escolha estatisticamente sustentada, não uma lacuna escondida.

**4.1 — Granularidade: leitura nacional é municipal; o "cruzamento fino" de São Paulo é sintético, não uma amostra real.**
A migration `0021` (RF-045) é explícita: o piloto de setor censitário de São Paulo **não é dado real da ANEEL/IBGE** — é uma grade sintética de células de 6 km (`ST_SquareGrid`), recortada pela geometria real do município, sobre a qual a potência residencial e o número de UCs **reais** e municipais de São Paulo são distribuídos **proporcionalmente à área de cada célula**, sem nenhum dado observado em nível sub-municipal. Cada linha é marcada com `e_dado_ilustrativo = 'true'` e a interface exibe o aviso "Cenário ilustrativo" (RF-045) exatamente para não permitir a leitura equivocada de que existe, hoje, uma medição real desagregada. Isso significa que **nenhuma conclusão sobre desigualdade intramunicipal pode ser extraída do Atlas hoje** — inclusive para São Paulo. A leitura nacional de moradia×MMGD é, e continuará sendo até uma fonte real de MMGD sub-municipal existir (BDGD por transformador, por exemplo), uma leitura em nível de município: um proxy de granularidade grosseira que mascara variação intramunicipal potencialmente enorme (a desigualdade entre um bairro nobre e uma favela dentro do mesmo município não aparece).

**4.2 — Cobertura de informalidade fundiária: 8 capitais, não o universo de assentamentos informais do Brasil.**
ZEIS/AEIS está seedado para São Paulo, Recife, Rio Branco, Rio de Janeiro, Contagem, Salvador, Fortaleza e Belo Horizonte — todas capitais ou grandes centros metropolitanos com legislação urbanística municipal madura o suficiente para ter perímetros ZEIS/AEIS digitalizados e acessíveis. O universo de assentamentos informais no Brasil é muito maior e inclui milhares de municípios pequenos e médios sem ZEIS formalmente instituída (ou com instituição não digitalizada). A camada `percentual_populacao_favela` / `numero_favelas_comunidades` (FCU/IBGE) tem cobertura nacional e é o proxy correto para uso em modelos nacionais; ZEIS/AEIS deve ser lido como um estudo de caso qualificado para as 8 capitais cobertas, não generalizado.

**4.3 — "Pessoas beneficiadas" e população municipal são estimativas, não contagens diretas.**
O Atlas não armazena população absoluta. Dois derivados dependem de fatores de conversão documentados:
- População municipal = `densidade_populacional × area_km2` (mesmo método usado desde o extractor de Renda e Trabalho/RAIS) — reconstituída, não uma contagem direta de censo.
- Pessoas beneficiadas por MMGD = `numero_ucs_residencial × 2,79` (pessoas/domicílio, IBGE Censo 2022) — uma estimativa demográfica aplicada a uma contagem real de UCs, nunca apresentada sem o rótulo "(estimativa)" na interface, por decisão explícita registrada no histórico do projeto.

**4.4 — Inadequação habitacional cobre apenas material das paredes, não o Déficit Habitacional oficial (Fundação João Pinheiro).**
O schema não contém uma medida equivalente ao "déficit habitacional" oficial (que combina coabitação, adensamento excessivo, ônus excessivo com aluguel e inadequação fundiária/construtiva em metodologia própria da FJP). O que existe é o componente de material das paredes do índice "Adequação da Moradia" do IBGE (Censo 2022, Tabela SIDRA 9928) — o componente "existência de energia elétrica" não foi incluído porque o IBGE não publicou tabela equivalente para 2022 (cobertura elétrica já ~99,8% segundo PNAD 2019, perdendo poder discriminativo). Qualquer citação a "inadequação habitacional" neste relatório ou em produtos derivados do Atlas deve especificar que se trata do proxy de material construtivo, não do Déficit Habitacional FJP — que é uma estatística estruturalmente diferente e não deve ser citada como se estivesse no Atlas.

**4.5 — Reforma Casa Brasil Solar é uma fonte estática, não replicável automaticamente.**
Diferente de todos os outros 21 extractors do Atlas — todos alimentados por fonte pública com URL/API estável —, este dado vem de um PDF pontual do Sistema de Informação ao Cidadão (SIC) da Caixa, fornecido manualmente. Não há endpoint público conhecido para atualização automática; qualquer atualização futura exige um novo pedido formal e um novo extrato manual no mesmo formato. Isso tem uma implicação operacional direta: o indicador "congela" no recorte nov/2025–abr/2026 até que uma nova solicitação SIC seja feita — não deve ser tratado, em nenhuma comunicação institucional, como um indicador "vivo" no mesmo sentido que MMGD/ANEEL (atualizável por reexecução de script).

**4.6 — O IVS geral (Seção 2.5) não inclui moradia, por desenho — reforçando a recomendação da Seção 3.1.**
Repetido aqui deliberadamente: qualquer leitura de "vulnerabilidade" feita a partir do `ivs` da view consolidada, sem cruzar explicitamente com `indice_precariedade_moradia`/`indice_seguranca_posse`, subestima sistematicamente a vulnerabilidade real dos territórios onde a barreira é habitacional — porque essa dimensão foi, por decisão de arquitetura, retirada do índice.

---

## 5. Alinhamento com as Metas Macro do Instituto Pólis

### 5.1 Redução da desigualdade socioespacial em territórios populares

O cruzamento moradia×solar descrito nas Seções 2 e 3 entrega, especificamente, o que uma leitura apenas de renda ou apenas de irradiação não consegue: a **distinção entre território pobre com telhado próprio e capaz de receber MMGD individual** (onde a resposta é crédito/informação) e **território pobre com informalidade fundiária ou construção precária** (onde a resposta correta é reforma habitacional e/ou geração compartilhada — nunca subsídio a instalação individual, que nesses casos não tem onde ser fisicamente instalada). Essa distinção é, por construção, invisível a qualquer observatório que trate moradia como "mais um indicador social" em vez de como a variável que determina se a resposta de política é energética, habitacional, ou as duas combinadas. O IVSH proposto na Seção 3.1 operacionaliza essa distinção como um único ranking acionável, sem abandonar o rigor de manter o IVS "puro" disponível para validação estatística independente.

### 5.2 Expansão segura de programas de reforma habitacional com componente solar

O histórico consolidado do Atlas — MCMV (FGTS/OGU), ZEIS/AEIS, favelas (FCU), e agora Reforma Casa Brasil Solar — permite exatamente o tipo de auditoria de focalização territorial que reduz o risco de over-investment em áreas já atendidas: antes de recomendar expansão do Reforma Casa Brasil Solar (ou de qualquer programa equivalente) para novos municípios, o Pólis pode primeiro verificar, com os dados já carregados, se os 1.093 municípios atualmente cobertos coincidem com os territórios de maior IVSH e maior precariedade construtiva — ou se, como a experiência de programas habitacionais brasileiros frequentemente mostra, a focalização segue a capacidade institucional do município (que tende a correlacionar com desenvolvimento, não com carência) em vez da vulnerabilidade real. A análise da Seção 3.3 é o instrumento direto para essa verificação, e deveria anteceder qualquer recomendação de expansão de escopo do programa.

---

## Recomendações Priorizadas

1. ~~Implementar o IVSH~~ — **feito nesta sessão** (Seção 3.1, migration `0028`, endpoint `GET /api/vazios-de-acesso?ordenarPor=ivsh` validado).
2. ~~Rodar a análise de eficácia territorial do Reforma Casa Brasil Solar~~ — **feito nesta sessão** (Seção 3.3, números validados contra o banco local).
3. ~~Testar formalmente o modelo controlado de MMGD residencial per capita sobre `indice_precariedade_moradia`, irradiação e renda (Seção 2.2)~~ — **feito nesta sessão** (ver "Registro de Implementação — Infraestrutura Estatística" abaixo, migration `0029`, endpoint `GET /api/analises-estatisticas` validado).
4. **Não comunicar externamente** o piloto de São Paulo como "cruzamento fino real" (Seção 4.1) nem "inadequação habitacional" do Atlas como equivalente ao Déficit Habitacional FJP (Seção 4.4) — ambos são riscos de credibilidade institucional identificados nesta auditoria.
5. **Tratar ZEIS/AEIS e Reforma Casa Brasil Solar como estudos de caso qualificados**, não achados nacionais generalizáveis, em qualquer material de comunicação — 8 capitais e 1.093 municípios, respectivamente, sobre um universo de ~5.570.

---

## Registro de Implementação (18/07/2026)

- **Migration `0028_view_ivsh_consolidado.sql`** aplicada ao banco local (`docker exec polis_postgres`) — cria `vw_ivsh_consolidado`, sem alterar nenhuma view existente.
- **Backend**: `ivsh` adicionado a `CRITERIOS_ORDENACAO` ([`vaziosDeAcesso.schema.ts`](../backend/src/schemas/vaziosDeAcesso.schema.ts)) e a `MunicipioClassificado`/`LinhaPainelBruta`/`buscarPainelBruto` ([`vaziosDeAcesso.service.ts`](../backend/src/services/vaziosDeAcesso.service.ts)), com docstrings atualizadas (metodologia + nota metodológica da API).
- **Validado**: `npx tsc --noEmit` limpo; `GET /api/vazios-de-acesso?ordenarPor=ivsh&ordem=desc` testado ao vivo contra o backend rodando localmente, retorno coerente com a expectativa metodológica.
- **Não feito nesta sessão**: nenhuma mudança de frontend (o `ivsh` já está disponível na API, mas não há ainda um seletor de critério de priorização na interface do Atlas — hoje o frontend usa sempre o padrão do backend). Registrar como próximo passo se o Pólis quiser expor o IVSH visualmente no Painel de Ranking ou no destaque de Vazios de Acesso.
- **Pendente de decisão do usuário**: `make migrate` do projeto ainda não inclui a migration `0028` na sequência documentada do README/Makefile — o arquivo já está na pasta `migrations/` na ordem correta (numeração sequencial), então `make migrate` deve aplicá-la automaticamente da próxima vez que rodar do zero; não foi necessário editar o Makefile.

---

## Registro de Implementação — Infraestrutura Estatística (18/07/2026)

Implementação da Recomendação #3 — decisão de escopo do usuário: motor **fixo,
materializado via ETL**, não microsserviço sob demanda nem motor genérico (ver
`docs/DECISOES.md`, ADR "Infraestrutura estatística integrada").

- **Migration `0029_analises_estatisticas.sql`** aplicada ao banco local — cria a tabela
  `analises_estatisticas` (uma linha por par variável testada x variável de resposta).
- **Script `backend/src/etl/loaders/calcular_analise_estatistica_moradia_mmgd.py`** —
  roda a mesma metodologia de correlação parcial de Spearman (resíduo de postos) já
  validada em `analisar_correlacao_mmgd_renda.py`, mas controlando **renda e irradiação
  simultaneamente** (o controle conjunto que a Recomendação #3 pede e que o script
  exploratório não fazia isoladamente), e lendo `potencia_residencial_kw` direto do
  Postgres (migration `0020`) em vez de reprocessar o Parquet bruto da ANEEL.
  **Bug real encontrado e corrigido nesta sessão**: `psycopg2` não tem adapter para
  `numpy.float64` (retorno nativo de `scipy`/`numpy`) — o valor caía no fallback de
  `repr()` do SQLAlchemy, gerando SQL inválido (`np.float64(0.1524)` interpretado como
  referência a um schema chamado `np`). Corrigido convertendo todo valor numérico para
  `float()` nativo do Python antes do upsert (`_valor_sql`).
- **Backend**: `analisesEstatisticas.service.ts`/`.controller.ts`/`.routes.ts`, novo
  endpoint público `GET /api/analises-estatisticas` (mesmo padrão de
  `rankingDistribuidoras.*` — sem query params, envelope com `metodologia` +
  `notaMetodologica` sempre presentes).
- **Validado nesta sessão**: migration aplicada; script rodado 2x contra o banco local
  (idempotência confirmada via `ON CONFLICT (variavel_x, variavel_y) DO UPDATE`,
  mesma contagem/valores nas duas execuções); `npx tsc --noEmit` do backend limpo;
  `GET /api/analises-estatisticas` testado ao vivo (backend local + curl, processo
  encerrado ao final do teste).

**Resultado real (n=5.570 municípios, controlando renda média domiciliar RAIS +
irradiação solar média INPE simultaneamente):**

| Variável X | rho bruto | rho parcial | p (parcial) | Robustez regional |
|---|---|---|---|---|
| Índice de Precariedade Habitacional | −0,1312 | **−0,1524** | 2,7×10⁻³⁰ | sinal mantido em 4/5 regiões |
| Índice de Segurança da Posse | −0,3060 | **−0,2976** | 3,0×10⁻¹¹⁴ | sinal mantido em 4/5 regiões |

**Leitura, com o mesmo cuidado metodológico já registrado na Seção 2.2 deste relatório
(correlação não é causalidade):**
- **Precariedade Habitacional confirma a hipótese central do Pólis**: mesmo controlando
  renda e irradiação simultaneamente, mais precariedade habitacional está associado a
  MENOS MMGD residencial per capita (sinal negativo, como esperado) — e o coeficiente
  parcial (−0,1524) é ligeiramente MAIOR em magnitude que o bruto (−0,1312), ou seja, o
  efeito não é só reflexo de renda/irradiação, ele se fortalece ao controlar por elas.
  Robusto em 4 das 5 regiões (a exceção não foi diagnosticada nesta sessão — ver "Próximo
  passo" abaixo).
- **Achado inesperado, reportado com transparência (não suavizado)**: o Índice de
  Segurança da Posse tem sinal **negativo** (−0,2976), não positivo como o sentido
  documentado da variável faria esperar (posse própria = mais segura = mais fácil
  investir em MMGD). Ou seja, controlando renda e irradiação, municípios com MAIS posse
  própria têm MENOS MMGD residencial per capita — o oposto do hipotetizado na Seção 1
  deste relatório. Isso não invalida a tese moradia-como-barreira (Precariedade
  Habitacional confirma), mas indica que "segurança da posse" isoladamente é um proxy
  mais fraco/ambíguo do que "precariedade física da edificação" para esse recorte — pode
  refletir composição urbana (aluguel concentrado em áreas mais verticalizadas/centrais,
  onde MMGD residencial individual também é fisicamente mais difícil por outros motivos,
  ex. `percentual_apartamento`, já usado como moderador no script exploratório). **Não
  investigado a fundo nesta sessão** — registrado aqui para não ocultar um resultado que
  contraria a hipótese, seguindo o mesmo princípio de transparência da Seção 4 deste
  relatório.
- **Próximo passo sugerido**: (1) identificar qual das 5 regiões diverge em sinal para
  cada variável (a robustez regional foi contada, não detalhada por região nesta
  sessão); (2) investigar o sinal invertido de Segurança da Posse controlando também
  `percentual_apartamento`, como o script exploratório já faz para outras variáveis.
  Nenhum dos dois é bloqueio para comunicar o resultado da Precariedade Habitacional.
- **Não feito nesta sessão**: nenhuma mudança de frontend (mesmo precedente do IVSH — a
  tabela já está disponível na API, sem interface própria ainda).

✅ SESSÃO FINALIZADA
