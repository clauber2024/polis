"""
INSPEÇÃO (não grava nada): confirma, via metadado real da API do IBGE, as
variáveis e classificações reais das Tabelas SIDRA 10295 e 10296 (RDPC —
Rendimento Domiciliar Per Capita, Censo 2022) antes de escrever o extractor
`extrair_rdpc_censo.py`.

Mesmo cuidado já documentado para os casos TSEE e percentual_apartamento em
ARQUITETURA.md: não confiar em número de tabela ou nome de variável vindo de
busca/documentação sem confirmar via `/metadados` da API real.
"""

import requests

TABELAS = {
    10295: "Rendimento domiciliar per capita médio, por município (RDPC)",
    10296: "Distribuição percentual de moradores por classes de RDPC em salários mínimos, por município",
}

for codigo, descricao in TABELAS.items():
    url = f"https://servicodados.ibge.gov.br/api/v3/agregados/{codigo}/metadados"
    print("=" * 78)
    print(f"Tabela {codigo}: {descricao}")
    print(f"Consultando: {url}")
    try:
        resposta = requests.get(url, timeout=60)
        resposta.raise_for_status()
        dados = resposta.json()
    except Exception as e:
        print(f"[ERRO] Falhou: {e}")
        continue

    print(f"Nome oficial: {dados.get('nome')}")
    print(f"Níveis territoriais disponíveis: {dados.get('nivelTerritorial')}")
    print(f"Períodos disponíveis (frequência {dados.get('periodicidade', {}).get('frequencia')}): "
          f"{dados.get('periodicidade', {}).get('inicio')} a {dados.get('periodicidade', {}).get('fim')}")

    print("\nVariáveis:")
    for variavel in dados.get("variaveis", []):
        print(f"  {variavel['id']:>6}  {variavel['nome']} ({variavel.get('unidade')})")

    print("\nClassificações:")
    for classificacao in dados.get("classificacoes", []):
        print(f"  === Classificação {classificacao['id']}: {classificacao['nome']} ===")
        for categoria in classificacao.get("categorias", []):
            print(f"      {categoria['id']:>10}  {categoria['nome']}")
    print()
