// ===================================================================
// リアルタイム対戦の通信プロトコル（ブラウザと対戦サーバーで共用）
// 版数を上げたら、サーバーとクライアントを両方更新すること（PVP対戦_設計書 13.2）。
// ===================================================================

const PVP_PROTOCOL = {
  VERSION: 1,

  // --- イベント名 ---------------------------------------------------
  EV: {
    // クライアント → サーバー（応答は ack で返る）
    HELLO: 'hello',
    JOIN_QUEUE: 'join_queue',
    CANCEL_QUEUE: 'cancel_queue',
    SUBMIT_PLACEMENT: 'submit_placement',
    SEND_ACTION: 'send_action',
    ACTION_COMPLETE: 'action_complete',
    SURRENDER: 'surrender',
    RESUME: 'resume',
    // サーバー → クライアント
    QUEUE_TIMER: 'queue_timer',
    MATCH_FOUND: 'match_found',
    PLACEMENT_STATUS: 'placement_status',
    BATTLE_START: 'battle_start',
    TURN_START: 'turn_start',
    RECEIVE_ACTION: 'receive_action',
    PLAYER_DISCONNECTED: 'player_disconnected',
    PLAYER_RECONNECTED: 'player_reconnected',
    STATE_SYNC: 'state_sync',
    BATTLE_END: 'battle_end',
    SERVER_ERROR: 'server_error',
  },

  // --- エラーコード -------------------------------------------------
  ERR: {
    VERSION_MISMATCH: 'VERSION_MISMATCH',
    INVALID_PAYLOAD: 'INVALID_PAYLOAD',
    INVALID_PARTY: 'INVALID_PARTY',
    ALREADY_IN_QUEUE: 'ALREADY_IN_QUEUE',
    ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
    NOT_IN_ROOM: 'NOT_IN_ROOM',
    NOT_YOUR_TURN: 'NOT_YOUR_TURN',
    STALE_SEQ: 'STALE_SEQ',
    INVALID_ACTION: 'INVALID_ACTION',
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    INVALID_TOKEN: 'INVALID_TOKEN',
    MAINTENANCE: 'MAINTENANCE',
    RATE_LIMITED: 'RATE_LIMITED',
    DUPLICATE_SESSION: 'DUPLICATE_SESSION',
    NOT_HELLO: 'NOT_HELLO',
    SERVER_ERROR: 'SERVER_ERROR',
  },

  // 試合の決着理由 → 表示名
  REASON_LABEL: {
    annihilation: '全滅',
    round_limit: '判定（規定ラウンド）',
    surrender: '降参',
    afk: '時間切れ（放置）',
    disconnect: '通信切断',
    void: '無効試合',
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = PVP_PROTOCOL;
