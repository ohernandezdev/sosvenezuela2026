import Link from 'next/link';
import FlagVE from '@/components/FlagVE';

// Secciones estáticas del pie del home (CTAs, vista previa de primeros auxilios y
// footer). Son un Server Component: se renderizan en el servidor y NO aportan
// JavaScript al bundle del cliente. Antes vivían dentro del componente cliente del
// home y se animaban con framer-motion; aquí el "lift" al hover es CSS puro
// (Tailwind) y se elimina la animación de scroll-reveal — el contenido se ve
// siempre, lo cual además es mejor para redes lentas (menos JS, sin jank).

const CTAS = [
  { icon: '📍', title: 'Reportar daño', desc: 'Marca edificios colapsados, fugas de gas, vías bloqueadas o personas atrapadas.', href: '/reportar', color: '#0D9488', bg: 'rgba(240,253,250,0.9)' },
  { icon: '🔎', title: 'Buscar persona', desc: 'Busca a un familiar por cédula, teléfono o nombre. Activa avisos en tiempo real.', href: '/buscar', color: '#0EA5E9', bg: 'rgba(240,249,255,0.9)' },
  { icon: '🩹', title: 'Primeros auxilios', desc: '12 guías basadas en Cruz Roja, OMS y FEMA. Disponibles sin conexión.', href: '/recomendaciones', color: '#7C3AED', bg: 'rgba(245,243,255,0.9)' },
];

const TIPS = [
  { icon: '🏠', title: 'Durante el sismo', tip: 'Agáchate, cúbrete y agárrate. El "triángulo de la vida" es un MITO peligroso.' },
  { icon: '🩸', title: 'Hemorragias', tip: 'Presión directa firme. Si traspasa, añade tela encima — no retires la primera.' },
  { icon: '❤️', title: 'RCP', tip: '100–120 compresiones/min, 5 cm profundidad. No pares hasta que llegue ayuda.' },
  { icon: '🆘', title: 'Si quedas atrapado', tip: 'Golpea tuberías, no grites. No enciendas fuego (posible fuga de gas).' },
];

export default function HomeStatic() {
  return (
    <>
      {/* ── CTAs ───────────────────────────────── */}
      <section className="px-4 max-w-6xl mx-auto mb-12">
        <div className="grid sm:grid-cols-3 gap-4">
          {CTAS.map(item => (
            <Link key={item.href} href={item.href}>
              <div className="rounded-3xl p-6 h-full cursor-pointer sheen-card transition-transform duration-200 hover:-translate-y-1.5"
                style={{ background: item.bg, border: `1px solid ${item.color}22`, boxShadow: 'var(--shadow-sm)' }}>
                <div className="text-3xl mb-3">{item.icon}</div>
                <div className="font-display font-bold text-lg mb-2" style={{ color: 'var(--text-1)' }}>{item.title}</div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{item.desc}</p>
                <div className="mt-4 text-xs font-bold" style={{ color: item.color }}>
                  {item.href === '/recomendaciones' ? 'Ver guías →' : 'Ir →'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── FIRST AID PREVIEW ──────────────────── */}
      <section className="px-4 max-w-6xl mx-auto mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Primeros auxilios — más urgentes</h2>
          <Link href="/recomendaciones" className="text-xs font-bold whitespace-nowrap" style={{ color: 'var(--primary)' }}>Ver las 12 guías →</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIPS.map(item => (
            <Link key={item.icon} href="/recomendaciones">
              <div className="rounded-2xl p-4 h-full cursor-pointer sheen-card transition-transform duration-200 hover:-translate-y-1"
                style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-display font-semibold text-sm mb-1.5" style={{ color: 'var(--text-1)' }}>{item.title}</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{item.tip}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────── */}
      <footer className="px-4 py-9 max-w-6xl mx-auto" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FlagVE size={30} />
            <div>
              <div className="font-display font-bold text-sm" style={{ color: 'var(--text-1)' }}>SOS Venezuela 2026</div>
              <div className="text-xs" style={{ color: 'var(--text-3)' }}>sosvenezuela2026.com · Uso humanitario · Sin fines comerciales</div>
            </div>
          </div>
          <div className="rounded-2xl px-4 py-2 text-center" style={{ background: '#FEF9C3' }}>
            <div className="text-[11px] font-medium" style={{ color: '#713F12' }}>Emergencias Venezuela</div>
            <div className="font-display text-2xl font-extrabold" style={{ color: '#DC2626' }}>171</div>
          </div>
          <div className="flex gap-4 text-xs" style={{ color: 'var(--text-3)' }}>
            <Link href="/privacidad" className="hover:underline">Privacidad</Link>
            <Link href="/acerca" className="hover:underline">Acerca</Link>
            <Link href="/login" className="hover:underline">Ingresar</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
