-- 공개 글 뷰어가 로그아웃 상태에서도 글에 지정된 Quote Preset을
-- 렌더링할 수 있게 한다. 프리셋은 공개 홈페이지의 표시 설정이므로
-- 읽기는 공개하되, 쓰기 권한/RLS 정책은 기존 owner 전용 상태를 유지한다.

alter table public.quote_presets enable row level security;

drop policy if exists "quote_presets_select_public"
  on public.quote_presets;

create policy "quote_presets_select_public"
on public.quote_presets
for select
to anon, authenticated
using (true);

-- 공개 뷰어와 관리자 코드가 실제로 사용하는 컬럼만 읽게 한다.
revoke select on public.quote_presets from anon, authenticated;

grant select (id, user_id, name, settings, is_active)
  on public.quote_presets
  to anon;

grant select (id, user_id, name, settings, is_active, updated_at)
  on public.quote_presets
  to authenticated;
