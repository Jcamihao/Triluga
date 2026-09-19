# Matriz de Retenção de Dados

Versão: `2026-09-12`

## Princípios

- reter apenas o necessário para operação, segurança, defesa e cumprimento regulatório
- revisar periodicamente bases legais e necessidade
- aplicar descarte seguro para dados e arquivos

## Prazos sugeridos

- conta ativa: enquanto a conta estiver em uso
- perfil básico: enquanto a conta estiver ativa
- anúncios, favoritos e alertas: enquanto a conta estiver ativa ou até exclusão pelo usuário
- notificações: até `12 meses`, salvo necessidade operacional maior
- pedidos LGPD: até `5 anos` para trilha de atendimento e evidência de resposta
- logs técnicos sem payload sensível: `90 a 180 dias`, conforme capacidade e criticidade
- analytics não essencial: somente com consentimento; retenção recomendada de `12 meses`

## Eventos que devem disparar revisão de descarte

- encerramento da conta
- fim de obrigação regulatória ou contratual
- solicitação válida de eliminação ou anonimização

## Itens que precisam de automação no produto

- marcação e tratamento de pedidos LGPD concluídos
- relatório periódico de dados retidos além do prazo esperado
