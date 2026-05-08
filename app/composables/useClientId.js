import localforage from 'localforage';

const CLIENT_ID_KEY = '__nimbus_client_id_v1';
let _clientId = null;

/**
 * Returns a stable client ID persisted in localforage.
 * Used to track per-user server API token usage.
 */
export async function getClientId() {
  if (_clientId) return _clientId;

  try {
    let id = await localforage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      await localforage.setItem(CLIENT_ID_KEY, id);
    }
    _clientId = id;
    return id;
  } catch {
    if (!_clientId) _clientId = crypto.randomUUID();
    return _clientId;
  }
}
