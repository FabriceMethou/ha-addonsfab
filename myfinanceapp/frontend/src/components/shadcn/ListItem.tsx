const ListItem = ({ title, subtitle, amount }: { title: string; subtitle?: string; amount?: string }) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm">{title}</div>
        {subtitle && <div className="text-xs muted">{subtitle}</div>}
      </div>
      {amount && <div className="text-sm">{amount}</div>}
    </div>
  )
}

export default ListItem
