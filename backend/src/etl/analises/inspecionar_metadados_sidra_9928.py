"""
INSPEÇÃO (não grava nada): lista as classificações e categorias completas
da Tabela SIDRA 9928 (mesma tabela já usada em extrair_moradia_censo.py,
que hoje só consulta 2 categorias da classificação 125 — Total e Cortiço).

Objetivo: confirmar os códigos numéricos reais de "Casa" e "Apartamento"
dentro da classificação 125 (Tipo de domicílio) — necessários para testar
a hipótese de que tipologia habitacional (moradia densa/apartamento x casa
com telhado próprio) explica os casos que a análise de correlação não
conseguiu resolver (Segurança da Posse em Sul, Irradiação em Centro-Oeste).

Não tentar adivinhar esses códigos pela documentação — o próprio projeto já
teve um caso (TSEE, ver ARQUITETURA.md) em que o dicionário oficial estava
desatualizado em relação ao dado real. Consulta direto o metadado da API.
"""

import requests

URL_METADADOS = "https://servicodados.ibge.gov.br/api/v3/agregados/9928/metadados"

print(f"Consultando: {URL_METADADOS}")
resposta = requests.get(URL_METADADOS, timeout=60)
resposta.raise_for_status()
dados = resposta.json()

print(f"\nTabela: {dados.get('nome')}")
print("\nClassificações disponíveis:")
for classificacao in dados.get("classificacoes", []):
    print(f"\n=== Classificação {classificacao['id']}: {classificacao['nome']} ===")
    for categoria in classificacao.get("categorias", []):
        print(f"  {categoria['id']:>10}  {categoria['nome']}")
