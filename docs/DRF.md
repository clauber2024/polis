# DOCUMENTO DE REQUISITOS FUNCIONAIS
## Atlas Solar Justo — Plataforma WebGIS de Justiça Energética

---

## 1. ESCOPO E OBJETIVO DO SISTEMA

O Atlas Solar Justo é uma plataforma web de visualização e análise geoespacial da Micro e
Minigeração Distribuída (MMGD) solar no Brasil. O sistema cruza dados de potencial solar,
vulnerabilidade social e acesso efetivo à energia limpa, permitindo identificar territórios
prioritários para políticas públicas de justiça energética. A unidade de análise principal é
o município (código IBGE de 7 dígitos), com previsão de evolução futura para granularidades
sub-municipais.

---

## 2. PERFIS DE USUÁRIO

| ID | Perfil | Nível de acesso |
|---|---|---|
| P1 | Usuário Público | Visualização pública, sem dados administrativos |
| P2 | Pesquisador/Analista | Visualização + cruzamento avançado de variáveis |
| P3 | Gestor Público | Visualização + priorização territorial |
| P4 | Parceiro Técnico | Revisão metodológica e validação de dados |
| P5 | Equipe do Projeto | Gestão de bases, notas metodológicas, comunicação |
| P6 | Administrador | Controle total da plataforma |

---

## 3. REQUISITOS FUNCIONAIS — LANDING PAGE (PÚBLICA)

**RF-001.** O sistema deve exibir uma landing page pública e institucional, acessível sem autenticação.

**RF-002.** O sistema deve apresentar, no header fixo da landing page, um botão "Entrar" no canto superior direito, que direciona o usuário à tela de login.

**RF-003.** O sistema deve exibir uma seção de destaque (hero) contendo headline sobre justiça energética e MMGD solar, com dois botões de chamada à ação: "Explorar o Atlas" e "Saiba mais".

**RF-004.** O sistema deve exibir uma seção explicativa sobre o objetivo da plataforma (cruzamento de potencial solar, vulnerabilidade social e acesso efetivo à energia).

**RF-005.** O sistema deve exibir uma seção de indicadores nacionais em destaque, incluindo: número de sistemas MMGD conectados, potência total instalada, número de municípios com presença de MMGD, número de pessoas beneficiadas por créditos de energia, participação da solar distribuída na matriz elétrica nacional, e projeção futura de potência instalada.

**RF-006.** O sistema deve exibir uma seção listando as fontes de dados primárias utilizadas na plataforma (ANEEL/MMGD, IBGE Censo, CadÚnico, Tarifa Social de Energia Elétrica, IVS/IPEA, Irradiação Solar/INPE).

**RF-007.** O sistema deve exibir uma seção distinta, denominada "Referências Metodológicas" (ou "Observatórios Relacionados"), separada da seção de fontes de dados, descrevendo o diálogo metodológico entre a plataforma e o Observatório Brasileiro de Erradicação da Pobreza Energética (OBEPE), sem listá-lo como fonte de dado primário.

**RF-008.** O sistema deve exibir um footer institucional.

---

## 4. REQUISITOS FUNCIONAIS — AUTENTICAÇÃO

**RF-009.** O sistema deve apresentar uma tela de login com campos de e-mail/usuário e senha, e botão "Entrar".

**RF-010.** O sistema deve oferecer um link "Esqueci minha senha" na tela de login.

**RF-011.** O sistema deve exibir, na tela de login, um painel de "Acesso de demonstração" listando os seis perfis de usuário disponíveis, cada um com ícone, nome do perfil, e-mail de exemplo e botão de preenchimento automático das credenciais.

**RF-012.** O sistema deve preencher automaticamente os campos de e-mail e senha do formulário de login ao clicar em qualquer perfil de demonstração, sem exigir digitação manual.

**RF-013.** O sistema deve autenticar o usuário e redirecioná-lo à interface correspondente ao seu perfil após login bem-sucedido.

**RF-014.** O sistema deve oferecer funcionalidade de logout, disponível a partir do avatar do usuário no header.

---

## 5. REQUISITOS FUNCIONAIS — MAPA INTERATIVO (NÚCLEO COMUM)

**RF-015.** O sistema deve exibir um mapa do Brasil em tela cheia como elemento central das telas analíticas (Dashboard Público, Painel Analítico, Painel de Gestão Pública).

**RF-016.** O sistema deve permitir a ativação/desativação de camadas de dados sobre o mapa (MMGD instalada, Potencial Solar, IVS, Renda, CadÚnico, Tarifa Social, Vazios de Acesso, Índice de Pobreza Energética Regional).

**RF-017.** O sistema deve renderizar automaticamente cada camada com a técnica de visualização apropriada à natureza do indicador: choropleth (preenchimento sólido por município/estado) para indicadores agregados administrativamente, ou heatmap de densidade contínua para indicadores físico-espaciais (irradiação solar), sem exigir escolha manual do usuário.

**RF-018.** O sistema deve aplicar escala de cor de branco/cinza claro até verde energia para indicadores positivos em modo choropleth (ex.: MMGD, acesso).

**RF-019.** O sistema deve aplicar escala de cor de branco/cinza claro até amarelo solar/vermelho-laranja para indicadores de vulnerabilidade em modo choropleth (ex.: IVS, pobreza energética), reservando o vermelho aos valores críticos extremos.

**RF-020.** O sistema deve aplicar gradiente contínuo de azul petróleo translúcido a amarelo solar intenso para a camada de irradiação solar em modo heatmap de densidade.

**RF-021.** O sistema deve manter visíveis os contornos municipais/estaduais (linha fina) em modo choropleth, reforçando a leitura por território administrativo.

**RF-022.** O sistema deve realizar transição visual suave (fade/morph) ao alternar entre camadas com técnicas de visualização diferentes.

**RF-023.** O sistema deve exibir uma legenda flutuante no canto inferior do mapa, indicando: nome da camada ativa, escala de cores correspondente, e rótulo da técnica em uso ("Visualização por município" ou "Densidade contínua").

**RF-024.** O sistema deve permitir, na função de Cruzamento de Variáveis, a sobreposição de uma camada choropleth com uma camada heatmap, com controle de opacidade individual (slider) por camada.

**RF-025.** O sistema deve permitir, ao clicar em um município no mapa, a abertura de um painel com indicadores resumidos daquele município.

**RF-026.** O sistema deve oferecer campo de busca de município, disponível no header das telas com mapa.

---

## 6. REQUISITOS FUNCIONAIS — SELEÇÃO DE ESTADO E RANKING DE MUNICÍPIOS

**RF-027.** O sistema deve, ao selecionar um estado no mapa, aplicar destaque visual (zoom suave + contorno em amarelo solar) sobre o estado selecionado.

**RF-028.** O sistema deve, ao selecionar um estado, alternar automaticamente o painel lateral (ou bottom sheet em mobile) para o modo de Ranking de Municípios.

**RF-029.** O sistema deve exibir, no cabeçalho do painel de ranking, o nome do estado selecionado e o nome da camada/indicador ativo.

**RF-030.** O sistema deve filtrar a lista de ranking para conter exclusivamente municípios pertencentes ao estado selecionado, excluindo qualquer município de outros estados.

**RF-031.** O sistema deve ordenar a lista de municípios do maior para o menor valor do indicador da camada ativa.

**RF-032.** O sistema deve exibir, para cada item da lista de ranking: posição numérica, nome do município, valor do indicador em destaque visual (cor conforme natureza do indicador), barra de progresso horizontal relativa à posição no ranking estadual, e badge opcional de classificação (ex.: "Vazio de Acesso", "Acesso Consolidado").

**RF-033.** O sistema deve oferecer campo de busca/filtro rápido por nome de município dentro do painel de ranking.

**RF-034.** O sistema deve oferecer seletor de ordenação (crescente/decrescente) e alternância entre "ranking por valor absoluto" e "ranking por variação no período".

**RF-035.** O sistema deve, ao clicar em um município da lista de ranking, realizar zoom do mapa até o município e abrir o painel de detalhe correspondente.

**RF-036.** O sistema deve recalcular e reordenar automaticamente o ranking ao trocar a camada ativa com um estado já selecionado, com transição suave, sem exigir reseleção do estado.

**RF-037.** O sistema deve exibir, fixo no topo do painel de ranking, um bloco visualmente distinto com o Índice de Pobreza Energética Regional do estado selecionado, separado da lista de ranking municipal.

---

## 7. REQUISITOS FUNCIONAIS — GRANULARIDADE ESPACIAL VARIÁVEL DA MMGD

**RF-038.** O sistema deve tratar a granularidade espacial de cada indicador como um atributo do próprio dado (município, setor censitário, CEP, bairro ou outro), e não como definição fixa de arquitetura ou design.

**RF-039.** O sistema deve renderizar automaticamente o nível de granularidade disponível para cada indicador, sem exigir fixação prévia da unidade espacial.

**RF-040.** O sistema deve exibir, no painel de detalhe de municípios capitais/grandes cidades, um aviso visual informando que o dado está disponível apenas em nível municipal e pode ocultar desigualdades internas.

**RF-041.** O sistema deve alternar automaticamente para visualização em malha detalhada (mosaico de sub-regiões) ao selecionar um município que possua dado de MMGD em granularidade sub-municipal disponível.

**RF-042.** O sistema deve exibir um seletor de granularidade ("Município" / "Granularidade detalhada") no painel de filtros, habilitado apenas para municípios com dado fino disponível, e oculto/desabilitado para os demais.

**RF-043.** O sistema deve oferecer, no ranking municipal, um botão "Ver detalhamento interno" para municípios com dado sub-municipal disponível, abrindo ranking drill-down das sub-regiões no mesmo padrão visual do ranking estadual→municipal.

**RF-044.** O sistema deve exibir rótulos de unidade espacial (legendas, cabeçalhos, tooltips) de forma dinâmica, lidos do metadado da fonte de dados carregada, e não fixos no texto da interface.

**RF-045.** O sistema deve simular, exclusivamente para fins de prototipagem, um cenário piloto de dado sub-municipal para o município de São Paulo (SP), em granularidade de setor censitário, sinalizado com texto indicando se tratar de "Cenário ilustrativo — dado piloto aguardando granularidade real da ANEEL".

---

## 8. REQUISITOS FUNCIONAIS — DASHBOARD PÚBLICO (P1 — Usuário Público)

**RF-046.** O sistema deve exibir, para o perfil Usuário Público, painel lateral de filtros com opções de estado, região, faixa de potência instalada e período.

**RF-047.** O sistema deve oferecer botão de download de dados públicos nos formatos CSV e GeoJSON.

**RF-048.** O sistema não deve exibir, para o perfil Usuário Público, qualquer botão de acesso ao painel administrativo.

---

## 9. REQUISITOS FUNCIONAIS — PAINEL ANALÍTICO (P2 — Pesquisador/Analista)

**RF-049.** O sistema deve oferecer painel de Cruzamento de Variáveis, permitindo combinar os indicadores: MMGD solar, Renda, CadÚnico, Tarifa Social, IVS, Potencial Solar e Índice de Pobreza Energética Regional.

**RF-050.** O sistema deve permitir a seleção de dois ou mais municípios para comparação simultânea, exibindo tabela e/ou gráfico comparativo lado a lado.

**RF-051.** O sistema deve oferecer botão "Gerar leitura analítica", produzindo texto-resumo automático sobre o cruzamento de variáveis selecionado.

**RF-052.** O sistema deve oferecer botão de exportação de tabelas de dados nos formatos CSV e XLSX.

**RF-053.** O sistema deve exibir gráficos de dispersão e de série temporal para os indicadores selecionados.

**RF-054.** O sistema deve oferecer, no seletor de Cruzamento de Variáveis, a opção "Índice de Pobreza Energética Regional", com tooltip explicativo informando sua granularidade estadual e inspiração metodológica no OBEPE.

---

## 10. REQUISITOS FUNCIONAIS — PAINEL DE GESTÃO PÚBLICA (P3 — Gestor Público)

**RF-055.** O sistema deve exibir uma seção de "Territórios Prioritários", destacando municípios com alto potencial solar e baixo acesso à MMGD, com badge "Vazio de Acesso".

**RF-056.** O sistema deve oferecer ranking de priorização para políticas públicas, ordenável por diferentes critérios.

**RF-057.** O sistema deve exibir painel de "vazios de acesso" em visualização do tipo heatmap.

**RF-058.** O sistema deve oferecer botão para geração de relatório-resumo exportável (PDF) do território selecionado.

---

## 11. REQUISITOS FUNCIONAIS — PAINEL DO PARCEIRO TÉCNICO (P4)

**RF-059.** O sistema deve exibir lista de bases de dados com status de revisão metodológica, classificadas por badges: "Em revisão", "Validado", "Inconsistência encontrada".

**RF-060.** O sistema deve oferecer área para registro de observações sobre inconsistências encontradas em cruzamentos de dados.

**RF-061.** O sistema deve oferecer formulário simples para sugestão de melhorias em indicadores existentes.

**RF-062.** O sistema deve oferecer visualizador de documentação metodológica, incluindo notas referentes à inspiração do OBEPE no Índice de Pobreza Energética Regional.

---

## 12. REQUISITOS FUNCIONAIS — PAINEL DA EQUIPE DO PROJETO (P5)

**RF-063.** O sistema deve exibir dashboard de status de cada base de dados primária (ANEEL, IBGE, CadÚnico, TSEE, IVS/IPEA, INPE), com indicador de progresso.

**RF-064.** O sistema deve oferecer área de notas metodológicas com histórico de revisões, incluindo nota documentando a inspiração metodológica do OBEPE.

**RF-065.** O sistema deve oferecer área de notas metodológicas documentando a limitação atual de granularidade municipal da MMGD e o andamento da solicitação à ANEEL para dados sub-municipais.

**RF-066.** O sistema deve exibir classificação visual da "força dos achados" (escala de estrelas ou barras de confiança).

**RF-067.** O sistema deve exibir área de preparação de conteúdo para relatórios e comunicação pública, com lista de materiais em produção e respectivo status.

---

## 13. REQUISITOS FUNCIONAIS — PAINEL ADMINISTRATIVO (P6 — Administrador)

**RF-068.** O sistema deve exibir, exclusivamente para o perfil Administrador, um botão fixo no canto superior direito do header, com ícone de engrenagem/escudo, dando acesso à área administrativa.

**RF-069.** O sistema deve apresentar, na área administrativa, navegação lateral com as seções: Gestão de Bases de Dados, Revisão de Metadados, Aprovação de Indicadores, Publicação de Versões e Gerenciamento de Usuários.

**RF-070.** O sistema deve permitir, na seção Gestão de Bases de Dados, upload, atualização e validação de arquivos, com status: pendente, validado ou com erro, restrita às fontes de dados primárias.

**RF-071.** O sistema deve incluir, no cadastro/atualização da base ANEEL/MMGD, um campo de metadado "Granularidade espacial" selecionável entre: Município, Setor Censitário, CEP, Bairro ou Outro.

**RF-072.** O sistema deve exibir, na lista de status de bases de dados, uma entrada específica para "ANEEL/MMGD (granularidade fina)" com status "Aguardando liberação" e nota explicativa sobre a solicitação em andamento.

**RF-073.** O sistema deve apresentar, na seção Revisão de Metadados, tabela editável com os metadados de cada fonte de dados.

**RF-074.** O sistema deve apresentar, na seção Aprovação de Indicadores, fila de indicadores pendentes com ações "Aprovar" e "Rejeitar".

**RF-075.** O sistema deve apresentar, na seção Publicação de Versões, controle de versionamento dos mapas/dados publicados, com botão "Publicar nova versão".

**RF-076.** O sistema deve apresentar, na seção Gerenciamento de Usuários, tabela de usuários internos contendo perfil, status (ativo/inativo) e ações de editar/remover.

**RF-077.** O sistema deve exibir indicadores de status com codificação de cores: verde (ok), amarelo (atenção), vermelho (erro/pendência crítica).

---

## 14. REQUISITOS FUNCIONAIS — REFERÊNCIA METODOLÓGICA (OBEPE)

**RF-078.** O sistema não deve listar o OBEPE na seção de Fontes de Dados/Bases de Dados, em nenhuma tela ou painel, por não se tratar de fonte de dado primário.

**RF-079.** O sistema deve exibir, no bloco de Índice de Pobreza Energética Regional (Telas de Dashboard Público, Painel Analítico e Painel de Gestão Pública), indicação visual (ícone/badge) de que se trata de dado de granularidade estadual, distinta da granularidade municipal do ranking exibido junto.

**RF-080.** O sistema deve documentar, nos painéis de Parceiro Técnico e Equipe do Projeto, nota metodológica esclarecendo que o Índice de Pobreza Energética Regional é elaboração própria do Atlas, inspirada na abordagem do OBEPE, e construída a partir das fontes primárias já listadas (IBGE, CadÚnico, TSEE, IVS/IPEA).

---

## 15. REQUISITOS TRANSVERSAIS

**RT-001.** O sistema deve manter consistência visual (estilo glassmorphism e paleta de cores institucional) em todas as telas e perfis de usuário.

**RT-002.** O sistema deve ser responsivo em todos os componentes, com sidebar colapsável, mapas adaptáveis, tabelas com rolagem horizontal e painéis de filtro convertidos em bottom sheet em telas pequenas.

**RT-003.** O sistema deve utilizar senha padrão "123456" para todas as contas de demonstração, restritas a ambiente de prototipagem.

**RT-004.** O sistema deve priorizar alto contraste visual para dados e indicadores numéricos, utilizando amarelo solar ou verde energia sobre fundos claros/glass.

**RT-005.** O sistema deve manter distinção permanente entre fontes de dados primárias e referências metodológicas, nunca tratando referências metodológicas (como o OBEPE) como fonte de dado bruto.

**RT-006.** O sistema deve tratar a granularidade espacial da MMGD como atributo dinâmico do dado, nunca fixado na arquitetura ou no design da interface.
