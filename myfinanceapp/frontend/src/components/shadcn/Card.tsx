import React from 'react'

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  return (
    <div className={`glass ${className} transition-transform duration-200 hover:scale-[1.01]`}>{children}</div>
  )
}

export default Card
