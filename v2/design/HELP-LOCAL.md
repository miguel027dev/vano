# Ajuda local do VANO

A página /ajuda responde perguntas de uso com uma base local de orientações e links internos. Não usa modelo de IA, chave de API ou serviço externo. Não consulta nem altera conta, GPS ou histórico. Não grava as perguntas.

O endpoint POST /api/help/ask valida perguntas de 3 a 600 caracteres e usa a proteção CSRF e o limite de 12 consultas por IP por minuto. Perguntas fora do escopo recebem os assuntos disponíveis. Solicitações que exigem atendimento humano usam o formulário e protocolo de /contato.

Validação: server/help-assistant.test.mjs e o teste de API da ajuda cobrem temas, limites de entrada, dados pessoais e CSRF.
