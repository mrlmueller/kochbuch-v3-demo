const shimmer = `
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`

function Skel({ w = '100%', h = 14, r = 6, style }: { w?: string | number; h?: number; r?: number; style?: React.CSSProperties }) {
  return (
    <>
      <style>{shimmer}</style>
      <div style={{
        width: w, height: h, borderRadius: r,
        background: 'linear-gradient(90deg, rgba(120,90,60,0.08) 0%, rgba(120,90,60,0.16) 50%, rgba(120,90,60,0.08) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s ease-in-out infinite',
        ...style,
      }} />
    </>
  )
}

export function HomeSkeleton() {
  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '70px 20px 24px' }}>
        <Skel w={90} h={12} style={{ marginBottom: 12 }} />
        <Skel w="80%" h={32} r={8} style={{ marginBottom: 8 }} />
        <Skel w="55%" h={32} r={8} />
      </div>
      <div style={{ padding: '0 20px', marginBottom: 32 }}>
        <Skel h={420} r={24} />
      </div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ padding: '0 20px', marginBottom: 14 }}><Skel w={160} h={22} r={6} /></div>
        <div style={{ display: 'flex', gap: 14, padding: '0 20px', overflow: 'hidden' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ flexShrink: 0, width: 180 }}>
              <Skel w={180} h={180} r={16} style={{ marginBottom: 10 }} />
              <Skel w="80%" h={14} style={{ marginBottom: 6 }} />
              <Skel w="50%" h={11} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 20px' }}>
        <Skel w={140} h={22} r={6} style={{ marginBottom: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[0,1,2,3].map(i => <Skel key={i} h={92} r={18} />)}
        </div>
      </div>
    </div>
  )
}

export function BrowseSkeleton() {
  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '70px 20px 4px' }}>
        <Skel w={140} h={32} r={8} style={{ marginBottom: 8 }} />
        <Skel w={80} h={13} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '16px 20px', overflow: 'hidden' }}>
        {[60,100,130,90,110].map((w,i) => <Skel key={i} w={w} h={32} r={999} />)}
      </div>
      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {[0,1,2,3,4,5].map(i => (
          <div key={i}>
            <Skel h={140} r={18} style={{ marginBottom: 10 }} />
            <Skel w="85%" h={14} style={{ marginBottom: 6 }} />
            <Skel w="55%" h={11} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div style={{ paddingBottom: 60 }}>
      <Skel h={360} r={0} />
      <div style={{ padding: '24px 20px' }}>
        <Skel w={70} h={11} style={{ marginBottom: 10 }} />
        <Skel w="85%" h={28} r={8} style={{ marginBottom: 8 }} />
        <Skel w="60%" h={28} r={8} style={{ marginBottom: 22 }} />
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <Skel w="55%" h={14} /><Skel w={60} h={14} />
          </div>
        ))}
      </div>
    </div>
  )
}
