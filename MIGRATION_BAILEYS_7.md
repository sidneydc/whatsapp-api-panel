# Migração para Baileys 7.0.0

## Pré-requisitos

- [ ] Atualizar Node.js para versão 20+ 
- [ ] Projeto já está em ESM ✅ (type: "module" no package.json)

## Passos para Migração

### 1. Atualizar Node.js

```powershell
# Baixar e instalar Node.js 20 LTS ou superior
# https://nodejs.org/
```

### 2. Atualizar Baileys

```powershell
npm install @whiskeysockets/baileys@latest
# ou usar o novo pacote oficial:
npm uninstall @whiskeysockets/baileys
npm install baileys@latest
```

### 3. Mudanças no Auth State

O auth state precisa suportar novos campos:
- `lid-mapping` - mapeamento LID <-> PN
- `device-list` - lista de dispositivos
- `tctoken` - token TC

### 4. Mudanças no Código

#### LIDs (Local Identifiers)

```typescript
// ANTES (v6):
const jid = '5511999999999@s.whatsapp.net';

// DEPOIS (v7):
// LIDs são o formato preferido agora
// PNs (phone numbers) ainda funcionam mas LIDs são mais confiáveis

// Obter LID a partir de PN:
const lid = await sock.signalRepository.lidMapping.getLIDForPN(phoneNumber);

// MessageKey agora tem campos alternativos:
msg.key.remoteJidAlt // JID alternativo para DMs
msg.key.participantAlt // JID alternativo para grupos
```

#### Mudanças em Tipos

```typescript
// Contact type:
// ANTES: contact.jid
// DEPOIS: contact.id (preferido), contact.phoneNumber, contact.lid

// GroupMetadata:
// owner -> ownerPn
// descOwner -> descOwnerPn
```

#### Funções Removidas/Substituídas

```typescript
// ANTES:
isJidUser(jid)

// DEPOIS:
isPnUser(jid) // Para phone numbers
// LIDs também são JIDs válidos
```

#### Eventos Novos

```typescript
sock.ev.on('lid-mapping.update', (mapping) => {
  // Novo mapeamento LID/PN descoberto
  console.log('Novo mapeamento:', mapping);
});
```

### 5. Protobufs

Mudanças nos métodos disponíveis:
- `.create()` em vez de `.fromObject()`
- Apenas `.encode()` e `.decode()` disponíveis
- Usar `BufferJSON` utilities
- Usar `decodeAndHydrate()` para decodificar

### 6. ACKs

**IMPORTANTE:** Baileys 7.0 NÃO envia mais ACKs automaticamente para evitar bans.

### 7. Testar

Após atualização:
1. Testar criação de nova sessão
2. Testar envio de mensagens
3. Verificar recebimento de mensagens
4. Testar webhooks
5. Verificar persistência de credenciais

## Links Úteis

- [Guia de Migração Oficial](https://baileys.wiki/docs/migration/to-v7.0.0)
- [GitHub Baileys](https://github.com/WhiskeySockets/Baileys)
- [Documentação Baileys](https://baileys.wiki/)
- [Discord WhiskeySockets](https://whiskey.so/discord)

## Notas

- A versão 7.0.0 está em RC (Release Candidate)
- O pacote oficial agora é `baileys` ao invés de `@whiskeysockets/baileys`
- LIDs são mais confiáveis que PNs para identificação
- Projeto precisa usar Yarn v4+ com corepack

## Status Atual

- ✅ Projeto já está em ESM
- ⏳ Aguardando atualização do Node.js
- ✅ Credenciais persistem corretamente
- ✅ Sistema funcional com Baileys 6.7.19
