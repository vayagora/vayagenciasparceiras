-- Dados de demonstração (os mesmos do protótipo). Opcional: rode depois de todas as migrações (0001, 0002).
-- Para apagar: delete from deals; delete from partners;  (expedições e clientes saem junto)

insert into partners (id, name, afiliado, contact_email) values
  ('00000000-0000-0000-0000-000000000001', 'Horizonte Eventos', 'Horizonte Eventos', 'contato@horizonteeventos.com.br'),
  ('00000000-0000-0000-0000-000000000002', 'Grupo Atlas Engenharia', 'Grupo Atlas Engenharia', 'viagens@grupoatlas.com.br'),
  ('00000000-0000-0000-0000-000000000003', 'Colégio Vértice', 'Colégio Vértice', 'coordenacao@colegiovertice.com.br');

insert into expeditions (id, partner_id, name, city, start_date, days) values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Congresso Europeu de Cardiologia', 'Madrid', '2026-11-13', 6),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Feira de Turismo do Caribe', 'Cartagena', '2027-02-10', 5),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000002', 'Convenção anual de líderes', 'Gramado', '2026-12-03', 4),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000003', 'Intercâmbio cultural 2027', 'Santiago', '2027-01-15', 10),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'Imersão gastronômica', 'Lisboa', '2026-05-12', 5),
  ('00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0000-000000000002', 'Visita técnica à feira de construção', 'Buenos Aires', '2026-04-20', 3);

insert into clients (expedition_id, name, email, phone, stage, hubspot_status, last_follow_up, note) values
  ('00000000-0000-0000-0001-000000000001', 'Ana Ribeiro', 'ana.ribeiro@email.com', '(11) 98123-4410', 'fechado', 'existente', '2026-10-14', 'Tudo emitido. Enviado roteiro final.'),
  ('00000000-0000-0000-0001-000000000001', 'Bruno Carvalho', 'bruno.carvalho@email.com', '(11) 99672-1188', 'fechado', 'novo', '2026-10-16', 'Já possui seguro anual do cartão.'),
  ('00000000-0000-0000-0001-000000000001', 'Camila Duarte', 'camila.duarte@email.com', '(21) 98540-3321', 'proposta', 'existente', '2026-10-20', 'Aguardando aprovação do reembolso da clínica.'),
  ('00000000-0000-0000-0001-000000000001', 'Diego Martins', 'diego.martins@email.com', '(31) 99211-0456', 'contato', 'novo', '2026-10-21', 'Quer passar por Lisboa antes do congresso.'),
  ('00000000-0000-0000-0001-000000000001', 'Elisa Fontes', 'elisa.fontes@email.com', '(11) 97333-9087', 'fechado', 'novo', '2026-10-12', 'Hospeda-se com familiares.'),
  ('00000000-0000-0000-0001-000000000001', 'Fábio Nogueira', 'fabio.nogueira@email.com', '(41) 98877-6543', 'novo', 'novo', null, ''),
  ('00000000-0000-0000-0001-000000000001', 'Gislaine Prado', 'gislaine.prado@email.com', '(11) 98111-4512', 'proposta', 'novo', '2026-10-22', 'Viaja com o marido, Emerson.'),
  ('00000000-0000-0000-0001-000000000002', 'Gabriela Lins', 'gabriela.lins@email.com', '(81) 99456-2210', 'fechado', 'existente', '2026-06-12', 'Quarto com vista para o mar.'),
  ('00000000-0000-0000-0001-000000000002', 'Heitor Prado', 'heitor.prado@email.com', '(11) 98765-1200', 'contato', 'novo', '2026-10-18', ''),
  ('00000000-0000-0000-0001-000000000002', 'Isabela Rocha', 'isabela.rocha@email.com', '(48) 99123-7781', 'novo', 'novo', null, ''),
  ('00000000-0000-0000-0001-000000000002', 'João Vieira', 'joao.vieira@email.com', '(11) 99800-4433', 'desistiu', 'existente', '2026-10-10', 'Conflito de agenda.'),
  ('00000000-0000-0000-0001-000000000003', 'Karina Alves', 'karina.alves@email.com', '(51) 99812-3344', 'fechado', 'novo', '2026-10-09', ''),
  ('00000000-0000-0000-0001-000000000003', 'Lucas Barros', 'lucas.barros@email.com', '(51) 98444-1020', 'fechado', 'existente', '2026-10-11', 'Avaliando seguro até sexta.'),
  ('00000000-0000-0000-0001-000000000003', 'Marina Costa', 'marina.costa@email.com', '(11) 97654-8899', 'proposta', 'novo', '2026-10-20', ''),
  ('00000000-0000-0000-0001-000000000003', 'Otávio Dias', 'otavio.dias@email.com', '(19) 99321-5566', 'contato', 'novo', '2026-10-17', 'Pediu ligação após as 18h.'),
  ('00000000-0000-0000-0001-000000000003', 'Paula Mendes', 'paula.mendes@email.com', '(51) 98111-2233', 'fechado', 'novo', '2026-10-08', ''),
  ('00000000-0000-0000-0001-000000000004', 'Rafael Souza', 'rafael.souza@email.com', '(11) 98222-7700', 'fechado', 'existente', '2026-10-15', 'Autorização dos responsáveis recebida.'),
  ('00000000-0000-0000-0001-000000000004', 'Sofia Teixeira', 'sofia.teixeira@email.com', '(11) 97111-3300', 'proposta', 'novo', '2026-10-21', ''),
  ('00000000-0000-0000-0001-000000000004', 'Tiago Moura', 'tiago.moura@email.com', '(11) 96655-4411', 'novo', 'novo', null, ''),
  ('00000000-0000-0000-0001-000000000004', 'Valentina Reis', 'valentina.reis@email.com', '(11) 98989-1212', 'contato', 'novo', '2026-10-19', 'Vai passar por Mendoza antes.'),
  ('00000000-0000-0000-0001-000000000005', 'Laura Pacheco', 'laura.pacheco@email.com', '(11) 98440-2211', 'fechado', 'existente', '2026-03-18', ''),
  ('00000000-0000-0000-0001-000000000005', 'Ricardo Mota', 'ricardo.mota@email.com', '(11) 97320-6655', 'desistiu', 'novo', '2026-03-02', 'Optou por outra data.'),
  ('00000000-0000-0000-0001-000000000006', 'Sérgio Lemos', 'sergio.lemos@email.com', '(51) 99210-7788', 'fechado', 'novo', '2026-02-25', '');

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
  ('4513', 'c4513b', 'Gislaine Prado', 'gislaine.prado@email.com', false, 1)
) as v(hubspot_id, contact_id, name, email, is_titular, position)
join deals d on d.hubspot_id = v.hubspot_id;
