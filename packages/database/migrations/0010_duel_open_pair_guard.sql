create unique index if not exists duels_open_pair_game_unique
  on duels (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id), game_key)
  where state = 'open';
