import React from 'react'

const Stat = ({ label, value, hint, className = '' }: { label: string; value: React.ReactNode; hint?: string; className?: string }) => {
  return (
    <div className={className}>
      <div className="text-sm muted">{label}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      {hint && <div className="text-xs muted mt-1">{hint}</div>}
    </div>
  )
}

export default Stat
