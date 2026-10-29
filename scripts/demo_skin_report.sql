-- 조은성 데모 계정에 "피부 변화 리포트(퍼스널 AI 4단계)"가 보일 데이터를 더한다. 여러 번 실행해도 안전하다.
--
--   로컬:  docker exec -i swappy_postgres psql -U swappy -d swappy < scripts/demo_skin_report.sql
--   운영:  scripts/aws_db.sh sql scripts/demo_skin_report.sql --yes
--
-- 1) 10월 14일의 '처음' 분석 한 건: 가장 오래된 실제 분석을 바탕으로 수분·유분·모공을 조금 낮춘 값(+ 이미지는 원본 분석에서 읽는다).
--    촬영 조건이 달라 점수가 흔들린 정도로 보이는 값이라 '좋아졌다'를 과장하지 않는다.
-- 2) 두 분석 사이에 화장대에 더한 것으로 보이게 일부 제품의 담은 시각을 조정한다(에스네이처 세럼 199: 10/23, 센텔리안24 에센스로션 2305: 10/17).
WITH u AS (SELECT id FROM users WHERE email = 'eunseong@swappy.app'),
     src AS (
       SELECT a.* FROM skin_analyses a, u
       WHERE a.user_id = u.id AND a.concern_set = 'basic' AND NOT (a.metrics ? 'sample_of')
       ORDER BY a.created_at ASC LIMIT 1
     )
INSERT INTO skin_analyses (user_id, quota_kind, concern_set, provider_mode, metrics, created_at)
SELECT src.user_id, src.quota_kind, 'basic', 'sample',
       jsonb_set(jsonb_set(jsonb_set(src.metrics,
           '{concerns,moisture,ui}', '66'::jsonb),
           '{concerns,oiliness,ui}', '72'::jsonb),
           '{concerns,pore,ui}', '56'::jsonb) || jsonb_build_object('sample_of', src.id::text),
       TIMESTAMPTZ '2026-10-14 03:00:00+00'
FROM src
WHERE NOT EXISTS (
  SELECT 1 FROM skin_analyses x, u WHERE x.user_id = u.id AND x.created_at = TIMESTAMPTZ '2026-10-14 03:00:00+00'
);

UPDATE closet_items SET added_at = TIMESTAMPTZ '2026-10-23 08:00:00+00'
WHERE user_id = (SELECT id FROM users WHERE email = 'eunseong@swappy.app') AND product_id = 199;
UPDATE closet_items SET added_at = TIMESTAMPTZ '2026-10-17 08:00:00+00'
WHERE user_id = (SELECT id FROM users WHERE email = 'eunseong@swappy.app') AND product_id = 2305;
