// Bandera de Venezuela en CSS puro — se ve idéntica en cualquier SO y no hace
// peticiones de red. Componente presentacional puro (sin hooks): válido tanto en
// Server como en Client Components.
export default function FlagVE({ size = 28 }: { size?: number }) {
  return (
    <span aria-label="Venezuela" role="img"
      style={{
        display: 'inline-block', width: size, height: Math.round(size * 0.68),
        borderRadius: 5, flexShrink: 0, verticalAlign: 'middle',
        background: 'linear-gradient(#FFCC00 0 33.33%, #00247D 33.33% 66.66%, #CF142B 66.66% 100%)',
        boxShadow: '0 1px 2px rgba(11,18,32,0.18)', border: '1px solid rgba(11,18,32,0.08)',
      }} />
  );
}
