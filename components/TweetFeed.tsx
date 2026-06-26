'use client';
import { useEffect, useRef, useState } from 'react';

interface Tweet { id: string; tweet_id: string; url: string; posted_at: string }

declare global {
  interface Window { twttr?: { widgets?: { load?: (el?: HTMLElement) => void } } }
}

/* Sidebar card — matches the "Estado actual" / "Últimos reportes" panels.
   Renders curated X embeds vertically, ordered by publication time.

   X's widgets.js is a heavy (~hundreds of KB) third-party script that also
   pulls an iframe per tweet. On slow networks that competes with the critical
   above-the-fold content (map, reports). So we defer EVERYTHING — the tweet
   list fetch *and* the script — until the card scrolls near the viewport. */
export default function TweetFeed() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Reveal when the card is about to enter the viewport.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    fetch('/api/tweets').then(r => r.json()).then(d => Array.isArray(d) && setTweets(d)).catch(() => {});
  }, [visible]);

  useEffect(() => {
    if (!tweets.length) return;
    const render = () => window.twttr?.widgets?.load?.();
    if (window.twttr?.widgets) { render(); return; }
    if (document.getElementById('twitter-wjs')) { setTimeout(render, 800); return; }
    const s = document.createElement('script');
    s.id = 'twitter-wjs';
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    s.onload = render;
    document.body.appendChild(s);
  }, [tweets]);

  // Keep a mounted sentinel so the observer can fire even before tweets load.
  if (!tweets.length) return <div ref={rootRef} aria-hidden style={{ height: 1 }} />;

  return (
    <div ref={rootRef} className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-1)' }}>
          <span style={{ fontWeight: 900 }}>𝕏</span> Noticias en X
        </div>
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>por hora</span>
      </div>
      <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 520 }}>
        {tweets.map(t => (
          <blockquote key={t.id} className="twitter-tweet" data-dnt="true" data-theme="light" data-conversation="none">
            <a href={t.url.replace('twitter.com', 'x.com')}>{new Date(t.posted_at).toLocaleString('es-VE')}</a>
          </blockquote>
        ))}
      </div>
    </div>
  );
}
