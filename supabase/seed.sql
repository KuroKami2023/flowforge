-- ============================================================
-- FlowForge AI — optional demo seed
-- Replaces ':USER_ID' with a real auth.users id, then run in SQL editor.
-- (Easier path: use "Load demo" buttons in the dashboard — same content.)
-- ============================================================

-- JSON Data Transformer (runs fully offline: parse -> filter -> sort -> CSV)
insert into public.workflows (user_id, name, description, definition, enabled)
values (
  ':USER_ID',
  'JSON Data Transformer',
  'Parse raw JSON, filter rows, reshape fields and export CSV — no AI needed.',
  '{
    "nodes": [
      {"id":"trigger","type":"manual_trigger","config":{},"inputMapping":{},"outputMapping":{},"position":{"x":60,"y":160},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}},
      {"id":"parse","type":"json_parser","config":{"input":"{{trigger.raw_json}}"},"inputMapping":{},"outputMapping":{},"position":{"x":300,"y":160},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}},
      {"id":"adults","type":"filter","config":{"input":"{{nodes.parse.output.users}}","logic":"and","conditions":[{"field":"age","operator":"gte","value":18}]},"inputMapping":{},"outputMapping":{},"position":{"x":540,"y":160},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}},
      {"id":"reshape","type":"transform_data","config":{"input":"{{nodes.adults.output.items}}","operations":[{"op":"sort_by","field":"age","direction":"asc"}]},"inputMapping":{},"outputMapping":{},"position":{"x":780,"y":160},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}},
      {"id":"export","type":"csv_export","config":{"input":"{{nodes.reshape.output}}","filename":"adults.csv"},"inputMapping":{},"outputMapping":{},"position":{"x":1020,"y":160},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}}
    ],
    "connections": [
      {"from":"trigger","to":"parse"},
      {"from":"parse","to":"adults"},
      {"from":"adults","to":"reshape"},
      {"from":"reshape","to":"export"}
    ]
  }',
  true
);

-- Lead Enrichment (free public API, no key required)
insert into public.workflows (user_id, name, description, definition, enabled)
values (
  ':USER_ID',
  'Lead Enrichment',
  'Normalize a lead, enrich it from a free public API, then store the result.',
  '{
    "nodes": [
      {"id":"trigger","type":"manual_trigger","config":{},"inputMapping":{},"outputMapping":{},"position":{"x":80,"y":120},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}},
      {"id":"normalize","type":"set_value","config":{"values":{"name":"{{trigger.name}}","email":"{{trigger.email}}","company":"{{trigger.company}}"}},"inputMapping":{},"outputMapping":{},"position":{"x":340,"y":120},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}},
      {"id":"enrich","type":"http_request","config":{"method":"GET","url":"https://jsonplaceholder.typicode.com/users/1","timeoutMs":12000},"inputMapping":{},"outputMapping":{},"position":{"x":600,"y":120},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}},
      {"id":"pick","type":"transform_data","config":{"input":"{{nodes.enrich.output.data}}","operations":[{"op":"pick","fields":["name","email","company","website"]}]},"inputMapping":{},"outputMapping":{},"position":{"x":860,"y":120},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}},
      {"id":"store","type":"save_to_database","config":{"table":"workflow_records","data":{"lead":"{{nodes.normalize.output}}","enrichment":"{{nodes.pick.output}}"}},"inputMapping":{},"outputMapping":{},"position":{"x":1120,"y":200},"errorHandling":{"onError":"stop","retryCount":1,"retryDelayMs":500}}
    ],
    "connections": [
      {"from":"trigger","to":"normalize"},
      {"from":"normalize","to":"enrich"},
      {"from":"enrich","to":"pick"},
      {"from":"pick","to":"store"}
    ]
  }',
  true
);
