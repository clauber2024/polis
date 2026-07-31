"""
DIAGNÓSTICO: por que a tarifa residencial (indicadores_sociais.
tarifa_energia_residencial) não cobre 100% dos municípios?
================================================================================
CONTEXTO: usuário perguntou por que a tarifa não cobre todos os municípios
(30/07/2026). A hipótese inicial documentada em `extrair_tarifa_
distribuidoras.py` cita 2 causas: (1) município com área de concessão
dividida entre múltiplas distribuidoras (ambíguo, corretamente excluído) e
(2) distribuidora sem tarifa B1/Residencial/Convencional homologada
encontrada no dataset.

ACHADO REAL, checado ao vivo contra a API em produção antes deste script
existir (30/07/2026) — usuário citou Amazonas/Roraima como exemplo (não os
únicos, ver conversa): AM e RR têm exatamente 1 distribuidora cada
(Amazonas Energia, Roraima Energia — sem área de concessão dividida) e
MESMO ASSIM 100% dos municípios de ambos os estados estão SEM tarifa
(62/62 no AM, 15/15 em RR). Acre, com o mesmo perfil de estado servido por
uma única distribuidora (Energisa AC), está em 0% sem tarifa (22/22 COM
tarifa) — descarta "estado com distribuidora única" como causa estrutural.

HIPÓTESE A TESTAR AQUI: a causa (2) documentada no extractor — não é
"a distribuidora não tem tarifa homologada", é um MISMATCH DE NOME entre
dois datasets DIFERENTES da própria ANEEL:
  - `qualidade_conjuntos.sig_agente` (schema INDQUAL, ex.: para Amazonas
    Energia já confirmado como "AME" no crosswalk de
    `extrair_desempenho_conexao_mmgd.py`, MAPEAMENTO_MANUAL_CONFIRMADO)
  - `SigAgente` do dataset "Tarifas de aplicação das distribuidoras de
    energia elétrica" (`extrair_tarifa_distribuidoras.py`) — convenção de
    sigla PRÓPRIA desse dataset, sem garantia nenhuma de bater com o
    sig_agente do INDQUAL (são dois datasets ANEEL independentes).
Mesma classe de bug já confirmada 2x neste projeto (Enel GO=EQUATORIAL GO
no crosswalk de fila de conexão; "Forcel"/"João Cesa"/"Nova Palma"/
"Santa Maria" seguiam o mesmo padrão) — nome de cadastro divergente entre
fontes, não falta real de dado.

O QUE ESTE SCRIPT FAZ (SOMENTE LEITURA, não grava nada):
  1. Reaproveita `resolver_municipio_distribuidora` de
     `extrair_tarifa_distribuidoras.py` para o mapeamento município ->
     sig_agente INDQUAL (só distribuidora única, mesma regra já usada).
  2. Reaproveita `carregar_tarifa_mais_recente_por_distribuidora` (baixa o
     CSV se necessário) para obter o conjunto de SigAgente que TÊM tarifa
     B1/Residencial/Convencional homologada no dataset de tarifas.
  3. Pra cada sig_agente INDQUAL sem tarifa, tenta achar candidato(s) por
     substring normalizado no conjunto de SigAgente do dataset de tarifas
     (mesmo princípio de "casamento automático" já usado em
     construir_ranking_distribuidoras_conexao_mmgd.py) — reporta candidatos
     prováveis, NUNCA aplica automaticamente (confirmação manual é
     obrigatória, mesmo padrão do MAPEAMENTO_MANUAL_CONFIRMADO existente).
  4. Resume quantos municípios cada sig_agente sem match afeta, ordenado do
     maior impacto pro menor — prioriza investigação externa (pesquisa de
     CNPJ/histórico de aquisição) pelos casos que destravam mais município.
================================================================================
"""

import re
import sys

import pandas as pd
from sqlalchemy import create_engine

sys.path.insert(0, "backend/src/etl/loaders")

from extrair_tarifa_distribuidoras import (  # noqa: E402
    DATABASE_URL,
    baixar_se_necessario,
    carregar_tarifa_mais_recente_por_distribuidora,
    detectar_codificacao,
    resolver_municipio_distribuidora,
)


def normalizar(nome: str) -> str:
    n = nome.upper()
    n = re.sub(r"[-\s./]", "", n)
    return n


def buscar_candidatos(sig_agente_indqual: str, sig_agentes_tarifa: list[str]) -> list[str]:
    """Casamento automático por substring normalizado, só pra SUGERIR — nunca aplica sozinho.
    Mesmo princípio de construir_ranking_distribuidoras_conexao_mmgd.py."""
    alvo = normalizar(sig_agente_indqual)
    candidatos = []
    for sig_tarifa in sig_agentes_tarifa:
        normalizado = normalizar(sig_tarifa)
        if alvo in normalizado or normalizado in alvo:
            candidatos.append(sig_tarifa)
    return candidatos[:5]


def main():
    print("Investigação: cobertura de tarifa_energia_residencial — mismatch de nome entre")
    print("qualidade_conjuntos.sig_agente (INDQUAL) e SigAgente (dataset de tarifas ANEEL)?")
    print("=" * 88)

    engine = create_engine(DATABASE_URL)

    print("\n[1/3] Carregando mapeamento município -> distribuidora única (INDQUAL)...")
    municipio_distribuidora = resolver_municipio_distribuidora(engine)
    com_distribuidora_unica = municipio_distribuidora[
        municipio_distribuidora["distribuidora_unica"].notna()
    ].copy()
    print(f"      {len(com_distribuidora_unica)} município(s) com distribuidora única "
          f"(exclui os de área de concessão dividida — esses já são exclusão legítima, "
          f"não fazem parte desta investigação).")

    print("\n[2/3] Carregando SigAgente com tarifa B1/Residencial/Convencional homologada...")
    baixar_se_necessario()
    codificacao = detectar_codificacao()
    tarifa_por_distribuidora = carregar_tarifa_mais_recente_por_distribuidora(codificacao)
    sig_agentes_com_tarifa = set(tarifa_por_distribuidora.index)
    print(f"      {len(sig_agentes_com_tarifa)} SigAgente distinto(s) com tarifa homologada "
          f"no dataset de tarifas.")

    print("\n[3/3] Cruzando: quais sig_agente do INDQUAL (distribuidora única) NÃO batem "
          "com nenhum SigAgente do dataset de tarifas?")
    com_distribuidora_unica["tem_tarifa"] = com_distribuidora_unica["distribuidora_unica"].isin(
        sig_agentes_com_tarifa
    )

    resumo = (
        com_distribuidora_unica[~com_distribuidora_unica["tem_tarifa"]]
        .groupby("distribuidora_unica")
        .size()
        .sort_values(ascending=False)
    )

    if resumo.empty:
        print("\n✅ Nenhum sig_agente com distribuidora única ficou sem tarifa — hipótese de "
              "mismatch de nome REFUTADA. A causa deve ser outra (investigar município a "
              "município os casos residuais, se houver).")
        return

    print(f"\n{len(resumo)} sig_agente(s) do INDQUAL, com distribuidora única, SEM nenhuma tarifa "
          f"homologada encontrada — afetando {int(resumo.sum())} município(s) no total:\n")

    sig_agentes_tarifa_lista = sorted(sig_agentes_com_tarifa)
    linhas = []
    for sig_agente, n_municipios in resumo.items():
        candidatos = buscar_candidatos(str(sig_agente), sig_agentes_tarifa_lista)
        linhas.append({
            "sig_agente_indqual": sig_agente,
            "n_municipios_afetados": n_municipios,
            "candidatos_por_substring": ", ".join(candidatos) if candidatos else "(nenhum candidato automático)",
        })

    df_linhas = pd.DataFrame(linhas)
    print(df_linhas.to_string(index=False))

    print("\n" + "=" * 88)
    print("PRÓXIMO PASSO: para cada sig_agente acima SEM candidato automático (ou com candidato "
          "duvidoso), pesquisar externamente (CNPJ, histórico de aquisição/fusão, nome social "
          "completo) qual é o SigAgente real dessa distribuidora no dataset de tarifas — mesmo "
          "padrão de confiança já usado no MAPEAMENTO_MANUAL_CONFIRMADO de "
          "extrair_desempenho_conexao_mmgd.py. Depois, adicionar um crosswalk equivalente em "
          "extrair_tarifa_distribuidoras.py (NÃO aplicar os candidatos automáticos sem confirmar "
          "— substring pode casar coisa errada, ex.: duas distribuidoras diferentes com nomes "
          "parecidos).")
    print("✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
