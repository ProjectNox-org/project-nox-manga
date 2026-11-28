BEGIN;

ALTER TABLE public.xp_awards ALTER COLUMN chapter_id DROP NOT NULL;
ALTER TABLE public.xp_awards ALTER COLUMN work_id DROP NOT NULL;
ALTER TABLE public.xp_awards ADD COLUMN IF NOT EXISTS ref_id uuid;
ALTER TABLE public.xp_awards ADD COLUMN IF NOT EXISTS meta jsonb;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS season_xp integer NOT NULL DEFAULT 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS lifetime_xp integer NOT NULL DEFAULT 0;
UPDATE public.members SET season_xp = xp WHERE season_xp = 0 AND xp <> 0;
UPDATE public.members SET lifetime_xp = xp WHERE lifetime_xp = 0 AND xp <> 0;

CREATE UNIQUE INDEX IF NOT EXISTS ux_xp_work_once ON public.xp_awards (user_id, source, work_id)
  WHERE source IN ('RATE_WORK','FAVORITE') AND work_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_xp_ref_once ON public.xp_awards (user_id, source, ref_id)
  WHERE ref_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.award_xp(
  p_user uuid, p_source text, p_amount integer,
  p_work uuid DEFAULT NULL, p_chapter uuid DEFAULT NULL, p_ref uuid DEFAULT NULL,
  p_cooldown_seconds integer DEFAULT 0, p_daily_limit integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_recent integer; v_today integer; v_inserted uuid; v_xp integer; v_today_sao date;
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_source IS NULL THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'invalid');
  END IF;

  IF p_cooldown_seconds > 0 THEN
    SELECT count(*) INTO v_recent FROM public.xp_awards
     WHERE user_id = p_user AND source = p_source
       AND created_at > now() - make_interval(secs => p_cooldown_seconds);
    IF v_recent > 0 THEN RETURN jsonb_build_object('awarded', false, 'reason', 'cooldown'); END IF;
  END IF;

  v_today_sao := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF p_daily_limit > 0 THEN
    SELECT count(*) INTO v_today FROM public.xp_awards
     WHERE user_id = p_user AND source = p_source
       AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today_sao;
    IF v_today >= p_daily_limit THEN RETURN jsonb_build_object('awarded', false, 'reason', 'daily_limit'); END IF;
  END IF;

  INSERT INTO public.xp_awards (id, user_id, chapter_id, work_id, ref_id, amount, source, created_at)
  VALUES (gen_random_uuid(), p_user, p_chapter, p_work, p_ref, p_amount, p_source, now())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'duplicate');
  END IF;

  UPDATE public.members m
     SET xp = COALESCE(m.xp,0) + p_amount,
         season_xp = COALESCE(m.season_xp,0) + p_amount,
         lifetime_xp = COALESCE(m.lifetime_xp,0) + p_amount
   WHERE m.id = p_user
  RETURNING m.xp INTO v_xp;

  IF v_xp IS NULL THEN
    RAISE EXCEPTION 'member_not_found_%', p_user;
  END IF;

  RETURN jsonb_build_object('awarded', true, 'amount', p_amount, 'xp', v_xp, 'source', p_source);
END $$;

COMMIT;
