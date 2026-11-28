<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    ArrowRight,
    Eye,
    ShieldCheck,
    Loader2
  } from '@lucide/svelte';
  import type { Work } from '$lib/types';
  import { kindLabels } from '$lib/types';
  import { page } from '$app/state';
  import { resolveCoverUrl, resolveOriginalCoverUrl } from '$lib/covers';
  import { decodeHtmlEntities } from '$lib/html-entities';
  import { deferImage } from '$lib/actions/defer-image';

  type Props = {
    title: string;
    subtitle?: string;
    badge?: string;
    loadMoreSort?: 'latest' | 'most_read';
    works: Work[];
    shelfIndex?: number;
    periods?: Array<{ key: string; label: string }>;
    endpoint?: string;
  };

  let {
    title,
    subtitle,
    badge,
    loadMoreSort,
    works = [],
    shelfIndex = 1,
    periods = [],
    endpoint
  }: Props = $props();

  let extraWorks = $state<Work[]>([]);
  let remote = $state<{ period: string; works: Work[] } | null>(null);
  let activePeriod = $state(periods[0]?.key ?? '');
  let pendingPeriod = $state<string | null>(null);
  let periodError = $state('');
  let requestSeq = 0;
  let inflight: AbortController | null = null;
  let currentWorks = $derived(remote ? [...remote.works, ...extraWorks] : [...works, ...extraWorks]);
  // A metrica pertence ao periodo dos dados EXIBIDOS, nao ao botao ja pressionado.
  let displayedPeriod = $derived(remote?.period ?? periods[0]?.key ?? '');
  let canExpand = $derived(Boolean(loadMoreSort) || periods.length > 0);
  let expandTarget = $derived(
    (periods.find((p) => p.key === activePeriod)?.label ?? title).toLowerCase()
  );
  let periodLoading = $derived(pendingPeriod !== null);

  function periodMetric(work: any): { text: string; title: string } {
    const total = Number(work.views_total || 0);
    if (displayedPeriod === 'rising') {
      const growth = Number(work.growth ?? 0);
      const recent = Number(work.period_views ?? 0);
      const prev = Number(work.previous_views ?? 0);
      const pct = work.growth_pct;
      const text = pct === null || pct === undefined ? `+${formatViews(growth)}` : `+${pct}%`;
      const title = prev > 0
        ? `${growth > 0 ? '+' : ''}${formatViews(growth)} visualizacoes vs. semana anterior · ${formatViews(recent)} nos ultimos 7 dias`
        : `Novo destaque · ${formatViews(recent)} visualizacoes nos ultimos 7 dias`;
      return { text, title };
    }
    if (displayedPeriod === 'week' || displayedPeriod === 'month') {
      const value = Number(work.period_views ?? 0);
      const label = displayedPeriod === 'week' ? 'ultimos 7 dias' : 'ultimos 30 dias';
      return { text: formatViews(value), title: `${formatViews(value)} visualizacoes nos ${label}` };
    }
    return { text: formatViews(total), title: `${formatViews(total)} visualizacoes acumuladas` };
  }

  async function selectPeriod(key: string, force = false) {
    if (!endpoint) return;
    if (!force && key === activePeriod && remote?.period === key) return;
    activePeriod = key;
    periodError = '';
    isExpanded = false;
    extraWorks = [];
    // hasMore pertence ao filtro: sem reset, um ranking curto bloqueia a
    // paginacao dos filtros seguintes.
    hasMore = true;
    loadMoreError = false;
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    const seq = ++requestSeq;
    pendingPeriod = key;
    try {
      const res = await fetch(`${endpoint}?period=${encodeURIComponent(key)}`, {
        signal: controller.signal
      });
      if (!res.ok) throw new Error('Falha ao carregar o ranking');
      const payload = await res.json();
      if (seq !== requestSeq) return;
      remote = {
        period: typeof payload.period === 'string' ? payload.period : key,
        works: Array.isArray(payload.works) ? payload.works : []
      };
      updateScrollState();
      requestAnimationFrame(() => scrollContainer?.scrollTo({ left: 0 }));
    } catch (err: any) {
      if (seq !== requestSeq || err?.name === 'AbortError') return;
      periodError = 'Nao foi possivel carregar este ranking.';
    } finally {
      if (seq === requestSeq) pendingPeriod = null;
    }
  }

  function retryPeriod() {
    void selectPeriod(activePeriod, true);
  }

  let isExpanded = $state(false);
  let loadingMore = $state(false);
  let loadMoreError = $state(false);
  let hasMore = $state(true);

  let scrollContainer: HTMLDivElement | null = $state(null);
  let canScrollLeft = $state(false);
  let canScrollRight = $state(true);

  function formatViews(n?: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'k';
    return String(n);
  }

  function getScanInfo(work: any) {
    const list = (work.work_scans || []).filter((ws: any) => ws.scans && ws.scans.name);
    if (list.length === 0) {
      if (work.primary_scan?.name) {
        return {
          name: work.primary_scan.name,
          logoId: work.primary_scan.logo_id || work.primary_scan.logoId,
          isOfficial: work.primary_scan.is_official || work.primary_scan.isOfficial,
          extraCount: 0
        };
      }
      return null;
    }
    const primaryRow = list.find((ws: any) => ws.is_primary || ws.isPrimary) || list[0];
    const primary = primaryRow.scans;
    const extraCount = list.length - 1;
    return {
      name: primary.name,
      logoId: primary.logo_id || primary.logoId,
      isOfficial: primary.is_official || primary.isOfficial,
      extraCount
    };
  }

  function updateScrollState() {
    if (!scrollContainer) return;
    canScrollLeft = scrollContainer.scrollLeft > 10;
    canScrollRight =
      scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth - 10;
  }

  function bindScroll(node: HTMLElement) {
    node.addEventListener('scroll', updateScrollState, { passive: true });
    return {
      destroy() {
        node.removeEventListener('scroll', updateScrollState);
      }
    };
  }

  function scroll(direction: 'left' | 'right') {
    if (!scrollContainer) return;
    const amount = scrollContainer.clientWidth * 0.75;
    scrollContainer.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth'
    });
  }

  async function handleLoadMore() {
    if ((!loadMoreSort && periods.length === 0) || loadingMore || !hasMore) return;
    isExpanded = true;
    loadingMore = true;
    loadMoreError = false;
    try {
      // Fetch 12 items to neatly fill responsive grid rows (divisible by 6, 4, 3, 2)
      const url =
        periods.length > 0 && endpoint
          ? `${endpoint}?period=${encodeURIComponent(displayedPeriod)}&offset=${currentWorks.length}&limit=12`
          : `/api/works?sort=${loadMoreSort}&offset=${currentWorks.length}&limit=12&include_total=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao carregar mais obras');
      const data = await res.json();
      const newItems: Work[] = data.works || [];
      if (newItems.length === 0) {
        hasMore = false;
      } else {
        const existingIds = new Set(currentWorks.map((w) => w.id));
        const uniqueItems = newItems.filter((w) => !existingIds.has(w.id));
        if (uniqueItems.length === 0 || !data.hasMore) {
          hasMore = false;
        }
        extraWorks = [...extraWorks, ...uniqueItems];
      }
    } catch (err) {
      console.error(err);
      loadMoreError = true;
    } finally {
      loadingMore = false;
    }
  }

  function toggleExpand() {
    if (!isExpanded) {
      handleLoadMore();
    } else {
      isExpanded = false;
      extraWorks = [];
      loadMoreError = false;
    }
  }

  function fallbackCover(node: HTMLImageElement) {
    const onError = () => {
      if (node.src.includes('size=thumb') || node.src.includes('size=hero')) {
        node.src = resolveOriginalCoverUrl(node.src);
        return;
      }
      if (!node.src.includes('/brand/nox-symbol.webp')) {
        node.src = '/brand/nox-symbol.webp?v=3';
      }
    };
    node.addEventListener('error', onError);
    return {
      destroy() {
        node.removeEventListener('error', onError);
      }
    };
  }
</script>

{#if currentWorks.length > 0}
  <section class="shelf-section">
    <div class="shelf-header">
      <div class="title-cluster">
        {#if badge}
          <span class="shelf-badge">{badge}</span>
        {/if}
        <h2 class="shelf-title">
          <span class="title-accent-bar"></span>
          <span>{title}</span>
        </h2>
        {#if subtitle}
          <span class="shelf-subtitle">{subtitle}</span>
        {/if}
      </div>

      {#if periods.length > 0}
        <div class="shelf-controls">
          <div class="period-pills" role="group" aria-label="Período do ranking" aria-busy={periodLoading}>
            {#each periods as period (period.key)}
              <button
                type="button"
                class="period-pill"
                class:is-active={activePeriod === period.key}
                aria-pressed={activePeriod === period.key}
                disabled={pendingPeriod === period.key}
                onclick={() => selectPeriod(period.key)}
              >
                {period.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="shelf-actions">
        {#if canExpand}
          <button
            type="button"
            class="expand-inline-btn"
            onclick={toggleExpand}
            disabled={loadingMore}
            aria-label={isExpanded ? `Recolher ${expandTarget}` : `Expandir ${expandTarget}`}
          >
            {#if loadingMore}
              <Loader2 size={14} class="spin" />
              <span>Carregando...</span>
            {:else if isExpanded}
              <span>Recolher {expandTarget}</span>
            {:else}
              <span>Expandir {expandTarget}</span>
              <ArrowRight size={13} />
            {/if}
          </button>
        {/if}

        {#if !isExpanded}
          <div class="shelf-nav-arrows">
            <button
              type="button"
              class="shelf-arrow"
              disabled={!canScrollLeft}
              onclick={() => scroll('left')}
              aria-label="Rolar para a esquerda"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              class="shelf-arrow"
              disabled={!canScrollRight}
              onclick={() => scroll('right')}
              aria-label="Rolar para a direita"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Shelf container: Smooth Horizontal Scroll OR Clean Grid -->
    {#if periodError}
      <div class="period-error" role="alert">
        <span>{periodError}</span>
        <button type="button" class="period-retry" onclick={retryPeriod}>Tentar novamente</button>
      </div>
    {/if}

    <div
      class="shelf-scroll-container"
      class:is-expanded={isExpanded}
      class:is-loading={periodLoading}
      aria-busy={periodLoading}
      bind:this={scrollContainer}
      use:bindScroll
    >
      <div class="shelf-track" class:is-expanded={isExpanded}>
        {#if periodLoading}
          {#each Array(8) as _, i (i)}
            <div class="shelf-card shelf-skeleton" aria-hidden="true">
              <div class="card-cover-box skeleton-box"></div>
              <div class="card-info"><span class="skeleton-line"></span></div>
            </div>
          {/each}
        {:else}
        {#each currentWorks as work, i (work.id)}
          {@const isAdult = (work.content_rating || (work as any).contentRating) === 'ADULT_18'}
          {@const effectiveBlur = isAdult && (page.data?.blurNsfw ?? true)}
          {@const shelfCover = resolveCoverUrl(work.cover_id || (work as any).coverId, work.slug, work.id, { size: 'thumb' })}
          {@const scanInfo = getScanInfo(work)}
          {@const isEager = shelfIndex === 0 && i < 8}
          {@const priority = shelfIndex === 0 && i < 2 ? 'high' : 'auto'}
          {@const titleText = decodeHtmlEntities(work.title)}
          {@const metric = periodMetric(work)}
          <a href="/obra/{work.slug}" class="shelf-card">
            <div class="card-cover-box">
              <img
                use:fallbackCover
                src={shelfCover}
                alt=""
                onerror={(event) => {
                  const img = event.currentTarget as HTMLImageElement;
                  img.onerror = null;
                  img.src = '/brand/nox-symbol.webp?v=3';
                }}
                class="card-img"
                class:blurred-cover={effectiveBlur}
                width="210"
                height="300"
                loading={isEager ? "eager" : "lazy"}
                fetchpriority={priority}
                decoding="async"
              />
              <div class="card-glow"></div>

              <!-- Top-Left Views Badge -->
              <div class="card-views-badge" title={metric.title}>
                <Eye size={10} />
                <span>{metric.text}</span>
              </div>

              <!-- Top-Right Kind Badge -->
              <span class="card-kind-badge">{kindLabels[work.kind] || work.kind || 'Mangá'}</span>

              <!-- Bottom-Left Adult Badge (+18) -->
              {#if isAdult}
                <span class="adult-badge-bottom-left">+18</span>
              {/if}

              <!-- Bottom-Right Scan Badge -->
              {#if scanInfo}
                <div class="card-scan-badge" title="Traduzido por {scanInfo.name}{scanInfo.extraCount > 0 ? ` (+${scanInfo.extraCount} scans)` : ''}">
                  {#if scanInfo.logoId}
                    <img src="/media/{scanInfo.logoId}" alt="" class="scan-badge-logo" loading="lazy" decoding="async" />
                  {:else if scanInfo.isOfficial}
                    <ShieldCheck size={10} />
                  {/if}
                  <span class="scan-badge-name">
                    {scanInfo.name}
                    {#if scanInfo.extraCount > 0}
                      <span class="scan-extra-tag">+{scanInfo.extraCount}</span>
                    {/if}
                  </span>
                </div>
              {/if}
            </div>

            <!-- Title Only (Author removed for cleaner, artwork-focused home) -->
            <div class="card-info">
              <strong class="card-work-title" title={titleText}>
                {titleText}
              </strong>
            </div>
          </a>
        {/each}
        {/if}

      </div>
    </div>

    <!-- Expanded Footer (Aligned with Grid) -->
    {#if isExpanded}
      <div class="expanded-footer">
        {#if loadMoreError}
          <span class="load-error" role="status">Não foi possível carregar mais obras. Tente novamente.</span>
        {/if}
        {#if hasMore}
          <button
            type="button"
            class="btn-load-more-inline"
            onclick={handleLoadMore}
            disabled={loadingMore}
          >
            {#if loadingMore}
              <Loader2 size={16} class="spin" />
              <span>Carregando...</span>
            {:else}
              <span>Carregar mais do ranking {expandTarget}</span>
              <ArrowRight size={16} />
            {/if}
          </button>
        {:else}
          <span class="all-loaded-text">Todas as obras do ranking {expandTarget} foram carregadas.</span>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .load-error {
    color: #ffb4ab;
  }

  .shelf-section {
    position: relative;
    margin-bottom: 3.5rem;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    contain: layout style;
  }

  .shelf-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.35rem;
    padding-bottom: 0.85rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .title-cluster {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .shelf-badge {
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #dfc28d;
  }

  .shelf-title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.65rem;
    font-weight: 850;
    color: #ffffff;
    letter-spacing: -0.025em;
  }

  .title-accent-bar {
    width: 4px;
    height: 1.35rem;
    border-radius: 2px;
    background: linear-gradient(180deg, #dfc28d 0%, #b89552 100%);
    box-shadow: 0 0 10px rgba(223, 194, 141, 0.4);
  }

  .shelf-subtitle {
    font-size: 0.86rem;
    font-weight: 500;
    color: #94a3b8;
  }

  .shelf-actions {
    display: flex;
    align-items: center;
    gap: 1.1rem;
    order: 2;
    margin-left: auto;
  }

  .view-all-link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.88rem;
    font-weight: 600;
    color: #94a3b8;
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .view-all-link:hover {
    color: #dfc28d;
  }

  .expand-inline-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.38rem 0.85rem;
    border-radius: 8px;
    background: rgba(223, 194, 141, 0.1);
    border: 1px solid rgba(223, 194, 141, 0.3);
    color: #dfc28d;
    font-size: 0.82rem;
    font-weight: 750;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .expand-inline-btn:hover:not(:disabled) {
    background: rgba(223, 194, 141, 0.2);
    border-color: #dfc28d;
    transform: translateY(-1px);
  }

  .shelf-nav-arrows {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .shelf-arrow {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: all 0.2s ease;
  }

  .shelf-arrow:hover:not(:disabled) {
    background: rgba(223, 194, 141, 0.15);
    border-color: rgba(223, 194, 141, 0.4);
    color: #dfc28d;
  }

  .shelf-arrow:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  /* Horizontal Scroll View */
  .shelf-scroll-container {
    overflow-x: auto;
    scroll-behavior: smooth;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 0.5rem 0.25rem 1rem;
    margin: 0 -0.25rem;
    overscroll-behavior-x: contain;
  }

  .shelf-scroll-container::-webkit-scrollbar {
    display: none;
  }

  .shelf-track {
    display: flex;
    gap: 1.35rem;
    width: max-content;
  }

  /* Responsive Grid Expansion (No gaps, perfectly aligned columns) */
  .shelf-scroll-container.is-expanded {
    overflow-x: visible;
    scroll-snap-type: none;
    padding: 0;
    margin: 0;
  }

  .shelf-track.is-expanded {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 1.25rem;
    width: 100%;
  }

  @media (max-width: 1200px) {
    .shelf-track.is-expanded {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1rem;
    }
  }

  @media (max-width: 768px) {
    .shelf-track.is-expanded {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }
  }

  .shelf-track.is-expanded .shelf-card {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .shelf-track.is-expanded .card-cover-box {
    width: 100%;
    max-width: 100%;
    height: auto;
    aspect-ratio: 200 / 285;
  }

  /* Card Anatomy */
  .shelf-card {
    display: flex;
    flex-direction: column;
    width: 205px;
    scroll-snap-align: start;
    text-decoration: none;
    outline: none;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .shelf-card:hover {
    transform: translateY(-6px);
  }

  .card-cover-box {
    position: relative;
    width: 205px;
    height: 295px;
    aspect-ratio: 210 / 300;
    border-radius: 14px;
    overflow: hidden;
    background: #0f111c;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.65);
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
  }

  .shelf-card:hover .card-cover-box {
    border-color: rgba(223, 194, 141, 0.45);
    box-shadow:
      0 12px 30px -4px rgba(0, 0, 0, 0.85),
      0 0 24px -2px rgba(223, 194, 141, 0.25);
  }

  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .shelf-card:hover .card-img {
    transform: scale(1.04);
  }

  .card-glow {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 55%, rgba(6, 7, 12, 0.88) 100%);
    pointer-events: none;
  }

  /* Badges on Covers */
  .card-views-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0.22rem 0.52rem;
    border-radius: 6px;
    background: rgba(6, 7, 12, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #e2e8f0;
    font-size: 0.7rem;
    font-weight: 750;
    z-index: 4;
  }

  .card-kind-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 0.22rem 0.55rem;
    border-radius: 6px;
    background: rgba(6, 7, 12, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #dfc28d;
    font-size: 0.68rem;
    font-weight: 750;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    z-index: 4;
  }

  .adult-badge-bottom-left {
    position: absolute;
    bottom: 10px;
    left: 10px;
    padding: 0.22rem 0.5rem;
    border-radius: 5px;
    background: #dc2626;
    color: #ffffff;
    font-size: 0.7rem;
    font-weight: 850;
    letter-spacing: 0.04em;
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.6);
    z-index: 4;
  }

  .card-scan-badge {
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0.22rem 0.55rem;
    border-radius: 6px;
    background: rgba(6, 7, 12, 0.9);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(139, 92, 246, 0.35);
    color: #c4b5fd;
    font-size: 0.68rem;
    font-weight: 650;
    max-width: 125px;
    z-index: 4;
  }

  .scan-badge-logo {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .scan-badge-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scan-extra-tag {
    font-size: 0.62rem;
    color: #dfc28d;
    font-weight: 800;
    margin-left: 2px;
  }

  /* Card Info with Uniform Min-Height */
  .card-info {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.75rem;
    min-height: 2.7rem;
    min-width: 0;
    max-width: 100%;
    width: 100%;
  }

  .card-work-title {
    color: #f1f5f9;
    font-size: 0.94rem;
    font-weight: 750;
    line-height: 1.35;
    min-height: 2.6rem;
    min-width: 0;
    max-width: 100%;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
    transition: color 0.2s ease;
  }

  .shelf-card:hover .card-work-title {
    color: #c084fc;
  }



  /* Expanded Footer */
  .expanded-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.85rem;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
  }

  .btn-load-more-inline {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.75rem 1.6rem;
    border-radius: 999px;
    background: rgba(223, 194, 141, 0.15);
    border: 1px solid rgba(223, 194, 141, 0.4);
    color: #dfc28d;
    font-size: 0.88rem;
    font-weight: 750;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-load-more-inline:hover:not(:disabled) {
    background: rgba(223, 194, 141, 0.28);
    border-color: #dfc28d;
    color: #fff;
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(223, 194, 141, 0.25);
  }

  .btn-collapse {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.35rem 0.75rem;
    transition: color 0.15s ease;
  }

  .btn-collapse:hover {
    color: #e2e8f0;
    text-decoration: underline;
  }

  .all-loaded-text {
    font-size: 0.85rem;
    color: #71717a;
    font-style: italic;
  }

  @media (max-width: 640px) {
    .shelf-section {
      margin-bottom: 2.5rem;
    }

    .shelf-header {
      align-items: flex-start;
      margin-bottom: 0.85rem;
    }

    .shelf-title {
      font-size: 1.35rem;
    }

    .shelf-subtitle {
      font-size: 0.8rem;
    }

    .shelf-actions {
      gap: 0.6rem;
      flex-shrink: 0;
    }

    .view-all-link span {
      display: none;
    }

    .shelf-nav-arrows {
      display: flex;
    }

    .shelf-scroll-container {
      padding: 0.35rem 0.15rem 0.85rem;
      margin: 0 -0.15rem;
    }

    .shelf-track {
      gap: 0.85rem;
    }

    .shelf-card {
      width: 140px;
    }

    .card-cover-box {
      width: 140px;
      height: 200px;
      aspect-ratio: 140 / 200;
      border-radius: 10px;
    }

    .card-views-badge {
      top: 6px;
      left: 6px;
      padding: 0.18rem 0.42rem;
      font-size: 0.64rem;
      border-radius: 5px;
    }

    .card-kind-badge {
      top: 6px;
      right: 6px;
      padding: 0.18rem 0.45rem;
      font-size: 0.62rem;
      border-radius: 5px;
    }

    .adult-badge-bottom-left {
      bottom: 6px;
      left: 6px;
      padding: 0.16rem 0.42rem;
      font-size: 0.62rem;
    }

    .card-scan-badge {
      bottom: 6px;
      right: 6px;
      padding: 0.16rem 0.45rem;
      font-size: 0.62rem;
      max-width: 85px;
    }

    .card-info {
      margin-top: 0.5rem;
      min-height: 2.6rem;
      gap: 0.2rem;
    }

    .card-work-title {
      font-size: 0.86rem;
      line-height: 1.3;
      min-height: 2.25rem;
    }

    .shelf-track.is-expanded {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .shelf-track.is-expanded .shelf-card {
      width: 100%;
    }

    .shelf-track.is-expanded .card-cover-box {
      width: 100%;
      height: auto;
      aspect-ratio: 140 / 200;
    }
  }

  @media (max-width: 380px) {
    .shelf-card {
      width: 130px;
    }

    .card-cover-box {
      width: 130px;
      height: 185px;
    }

    .card-work-title {
      font-size: 0.82rem;
    }
  }

  :global(.spin) {
    animation: spinAnimation 1s linear infinite;
  }

  @keyframes spinAnimation {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .blurred-cover {
    filter: blur(18px) brightness(0.65);
    transform: scale(1.12);
  }

  .shelf-controls {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
    width: 100%;
    margin-top: 0.75rem;
    order: 3;
  }

  .period-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .period-pill {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(40, 30, 60, 0.7);
    color: #d4d4d8;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.01em;
    padding: 0 0.85rem;
    border-radius: 999px;
    cursor: pointer;
    min-height: 34px;
    transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .period-pill:hover {
    color: #f2f0f7;
    border-color: rgba(223, 194, 141, 0.45);
    background: rgba(60, 45, 90, 0.75);
  }

  .period-pill.is-active {
    color: #14101f;
    background: #dfc28d;
    border-color: #dfc28d;
  }

  .period-pill:focus-visible {
    outline: 2px solid #dfc28d;
    outline-offset: 2px;
  }

  .period-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    border: 1px solid rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.08);
    color: #fecaca;
    font-size: 0.85rem;
  }

  .period-retry {
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: transparent;
    color: #fecaca;
    border-radius: 8px;
    padding: 0.35rem 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }

  .shelf-scroll-container.is-loading {
    opacity: 0.55;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .shelf-controls {
      gap: 0.6rem;
    }
    .period-pills {
      width: 100%;
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .period-pill {
      flex: 0 0 auto;
      min-height: 36px;
    }
    .shelf-nav-arrows {
      margin-left: 0;
    }
    .shelf-actions {
      margin-left: auto;
    }
  }

  .shelf-skeleton {
    pointer-events: none;
  }

  .skeleton-box {
    aspect-ratio: 5 / 7;
    width: 100%;
    border-radius: 12px;
    background: linear-gradient(100deg, rgba(255, 255, 255, 0.05) 30%, rgba(255, 255, 255, 0.11) 50%, rgba(255, 255, 255, 0.05) 70%);
    background-size: 220% 100%;
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
  }

  .skeleton-line {
    display: block;
    height: 14px;
    width: 70%;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
  }

  @keyframes skeleton-shimmer {
    from { background-position: 120% 0; }
    to { background-position: -60% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-box { animation: none; }
  }
</style>
