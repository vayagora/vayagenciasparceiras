-- Dados de demonstração. Opcional: rode depois de todas as migrações.
-- A lista de clientes de cada expedição sai dos passageiros dos negócios (SPEC 2.0).
-- Para apagar: delete from deals; delete from partners;  (expedições saem junto)

insert into partners (id, name, afiliado, contact_email) values
  ('00000000-0000-0000-0000-000000000001', 'Horizonte Eventos', 'Horizonte Eventos', 'contato@horizonteeventos.com.br'),
  ('00000000-0000-0000-0000-000000000002', 'Grupo Atlas Engenharia', 'Grupo Atlas Engenharia', 'viagens@grupoatlas.com.br'),
  ('00000000-0000-0000-0000-000000000003', 'Colégio Vértice', 'Colégio Vértice', 'coordenacao@colegiovertice.com.br');

insert into expeditions (id, partner_id, name, city, start_date, days, arrival_airport, departure_airport) values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Congresso Europeu de Cardiologia', 'Madrid', '2026-11-13', 6, 'MAD', 'GRU'),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Feira de Turismo do Caribe', 'Cartagena', '2027-02-10', 5, 'CTG', 'GRU'),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000002', 'Convenção anual de líderes', 'Gramado', '2026-12-03', 4, 'POA', 'GRU'),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000003', 'Intercâmbio cultural 2027', 'Santiago', '2027-01-15', 10, 'SCL', 'GRU'),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'Imersão gastronômica', 'Lisboa', '2026-05-12', 5, 'LIS', 'GRU'),
  ('00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0000-000000000002', 'Visita técnica à feira de construção', 'Buenos Aires', '2026-04-20', 3, 'EZE', 'POA');

insert into deals (hubspot_id, afiliado, closed_on, legs, end_date, voo, hotel, seguro) values
  ('4501', 'Horizonte Eventos', '2026-08-05', '[{"city": "Madrid", "date": "2026-11-12"}]'::jsonb, '2026-11-19', 6890, 5400, 620),
  ('4502', 'Horizonte Eventos', '2026-09-02', '[{"city": "Lisboa", "date": "2026-11-09"}, {"city": "Madrid", "date": "2026-11-13"}]'::jsonb, '2026-11-20', 7120, 5400, 0),
  ('4503', 'Horizonte Eventos', '2026-07-21', '[{"city": "Madrid", "date": "2026-11-13"}]'::jsonb, '2026-11-18', 6890, 0, 590),
  ('4504', 'Grupo Atlas Engenharia', '2026-08-18', '[{"city": "Porto Alegre", "date": "2026-12-02"}, {"city": "Gramado", "date": "2026-12-03"}]'::jsonb, '2026-12-06', 1480, 2600, 140),
  ('4505', 'Grupo Atlas Engenharia', '2026-09-10', '[{"city": "Gramado", "date": "2026-12-03"}]'::jsonb, '2026-12-07', 1520, 2600, 0),
  ('4506', 'Grupo Atlas Engenharia', '2026-10-06', '[{"city": "Gramado", "date": "2026-12-03"}]'::jsonb, '2026-12-06', 1480, 2600, 140),
  ('4507', 'Colégio Vértice', '2026-09-25', '[{"city": "Santiago", "date": "2027-01-15"}]'::jsonb, '2027-01-25', 2890, 4100, 380),
  ('4508', 'Horizonte Eventos', '2026-09-14', '[{"city": "Barcelona", "date": "2026-11-10"}, {"city": "Madrid", "date": "2026-11-14"}]'::jsonb, '2026-11-19', 5980, 4800, 0),
  ('4509', 'Horizonte Eventos', '2026-06-12', '[{"city": "Cartagena", "date": "2027-02-09"}]'::jsonb, '2027-02-15', 4300, 3900, 0),
  ('4510', 'Horizonte Eventos', '2026-09-28', '[{"city": "Paris", "date": "2026-08-01"}]'::jsonb, '2026-08-10', 5200, 3600, 410),
  ('4511', 'Horizonte Eventos', '2026-03-18', '[{"city": "Lisboa", "date": "2026-05-11"}]'::jsonb, '2026-05-17', 6400, 4200, 520),
  ('4512', 'Grupo Atlas Engenharia', '2026-02-25', '[{"city": "Buenos Aires", "date": "2026-04-19"}]'::jsonb, '2026-04-23', 1900, 1500, 120),
  ('4513', 'Horizonte Eventos', '2026-09-20', '[{"city": "Madrid", "date": "2026-11-12"}]'::jsonb, '2026-11-19', 8000, 6000, 600);

-- Negócios em aberto e perdido (aparecem na lista, não remuneram)
insert into deals (hubspot_id, afiliado, closed_on, hs_stage, stage_kind, partner_note, legs, end_date, voo) values
  ('4514', 'Horizonte Eventos', null, 'presentationscheduled', 'open', 'Quer passar por Lisboa antes do congresso.', '[{"city": "Madrid", "date": "2026-11-12"}]'::jsonb, '2026-11-19', 0),
  ('4515', 'Horizonte Eventos', null, 'closedlost', 'lost', '', '[{"city": "Cartagena", "date": "2027-02-09"}]'::jsonb, '2027-02-15', 0);

-- Passageiros (um titular por negócio). O negócio 4513 é de um casal: Emerson (titular) e Gislaine.
insert into deal_passengers (deal_id, hubspot_contact_id, name, email, is_titular, position)
select d.id, v.contact_id, v.name, v.email, v.is_titular, v.position from (values
  ('4501', 'c4501', 'Ana Ribeiro', 'ana.ribeiro@email.com', true, 0),
  ('4502', 'c4502', 'Bruno Carvalho', 'bruno.carvalho@email.com', true, 0),
  ('4503', 'c4503', 'Elisa Fontes', 'elisa.fontes@email.com', true, 0),
  ('4504', 'c4504', 'Karina Alves', 'karina.alves@email.com', true, 0),
  ('4505', 'c4505', 'Lucas Barros', 'lucas.barros@email.com', true, 0),
  ('4506', 'c4506', 'Paula Mendes', 'paula.mendes@email.com', true, 0),
  ('4507', 'c4507', 'Rafael Souza', 'rafael.souza@email.com', true, 0),
  ('4508', 'c4508', 'Marcelo Antunes', 'marcelo.antunes@email.com', true, 0),
  ('4509', 'c4509', 'Gabriela Lins', 'gabriela.lins@email.com', true, 0),
  ('4510', 'c4510', 'Helena Prates', 'helena.prates@email.com', true, 0),
  ('4511', 'c4511', 'Laura Pacheco', 'laura.pacheco@email.com', true, 0),
  ('4512', 'c4512', 'Sérgio Lemos', 'sergio.lemos@email.com', true, 0),
  ('4513', 'c4513a', 'Emerson Prado', 'emerson.prado@email.com', true, 0),
  ('4513', 'c4513b', 'Gislaine Prado', 'gislaine.prado@email.com', false, 1),
  ('4514', 'c4514', 'Diego Martins', 'diego.martins@email.com', true, 0),
  ('4515', 'c4515', 'João Vieira', 'joao.vieira@email.com', true, 0)
) as v(hubspot_id, contact_id, name, email, is_titular, position)
join deals d on d.hubspot_id = v.hubspot_id;
