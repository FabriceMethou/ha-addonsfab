import { useState } from 'react';

// Tremor imports
import {
  Card as TremorCard,
  Title,
  AreaChart,
  DonutChart,
  BarList,
  Flex,
  Text,
  Metric,
  BadgeDelta,
  LineChart as TremorLineChart,
  Grid,
} from '@tremor/react';

// Recharts (Shadcn/ui) imports
import {
  LineChart,
  Line,
  AreaChart as RechartsAreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Nivo imports
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveCalendar } from '@nivo/calendar';
import { ResponsiveSunburst } from '@nivo/sunburst';

// Sample financial data
const monthlyPerformance = [
  { month: 'Jan', revenue: 45000, expenses: 32000, profit: 13000 },
  { month: 'Feb', revenue: 52000, expenses: 34000, profit: 18000 },
  { month: 'Mar', revenue: 48000, expenses: 31000, profit: 17000 },
  { month: 'Apr', revenue: 61000, expenses: 38000, profit: 23000 },
  { month: 'May', revenue: 55000, expenses: 36000, profit: 19000 },
  { month: 'Jun', revenue: 67000, expenses: 40000, profit: 27000 },
];

const portfolioAllocation = [
  { name: 'Stocks', value: 45000, percentage: 45 },
  { name: 'Bonds', value: 25000, percentage: 25 },
  { name: 'Real Estate', value: 15000, percentage: 15 },
  { name: 'Cash', value: 10000, percentage: 10 },
  { name: 'Crypto', value: 5000, percentage: 5 },
];

const categorySpending = [
  { name: 'Housing', value: 1200 },
  { name: 'Food', value: 800 },
  { name: 'Transport', value: 450 },
  { name: 'Entertainment', value: 300 },
  { name: 'Utilities', value: 250 },
  { name: 'Shopping', value: 600 },
];

// Daily spending data for calendar (Nivo)
const generateCalendarData = () => {
  const data: Array<{ day: string; value: number }> = [];
  const startDate = new Date('2025-01-01');
  for (let i = 0; i < 365; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    data.push({
      day: date.toISOString().split('T')[0],
      value: Math.floor(Math.random() * 500) + 50,
    });
  }
  return data;
};

// Sunburst data for expense breakdown (Nivo)
const expenseHierarchy = {
  name: 'Total Expenses',
  children: [
    {
      name: 'Fixed',
      children: [
        { name: 'Rent', value: 1200 },
        { name: 'Insurance', value: 300 },
        { name: 'Subscriptions', value: 150 },
      ],
    },
    {
      name: 'Variable',
      children: [
        { name: 'Food', value: 800 },
        { name: 'Shopping', value: 600 },
        { name: 'Entertainment', value: 300 },
      ],
    },
    {
      name: 'Transport',
      children: [
        { name: 'Gas', value: 200 },
        { name: 'Public Transit', value: 150 },
        { name: 'Maintenance', value: 100 },
      ],
    },
  ],
};

// Nivo line chart data
const nivoLineData = [
  {
    id: 'Portfolio Value',
    data: monthlyPerformance.map(d => ({ x: d.month, y: d.revenue })),
  },
  {
    id: 'Expenses',
    data: monthlyPerformance.map(d => ({ x: d.month, y: d.expenses })),
  },
];

// Nivo pie data
const nivoPieData = portfolioAllocation.map(item => ({
  id: item.name,
  label: item.name,
  value: item.value,
}));

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function DashboardTestPage() {
  const [selectedLibrary, setSelectedLibrary] = useState<'all' | 'tremor' | 'recharts' | 'nivo'>('all');

  return (
    <div className="min-h-screen bg-background p-8">
      {/* Header */}
      <div className="max-w-[1600px] mx-auto mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-4">Chart Library Comparison</h1>
        <p className="text-foreground-muted mb-6">
          Compare three modern chart libraries for financial dashboards
        </p>

        {/* Library Filter */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setSelectedLibrary('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedLibrary === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-card text-foreground-muted hover:bg-card-hover'
            }`}
          >
            Show All
          </button>
          <button
            onClick={() => setSelectedLibrary('tremor')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedLibrary === 'tremor'
                ? 'bg-blue-500 text-white'
                : 'bg-card text-foreground-muted hover:bg-card-hover'
            }`}
          >
            Tremor Only
          </button>
          <button
            onClick={() => setSelectedLibrary('recharts')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedLibrary === 'recharts'
                ? 'bg-blue-500 text-white'
                : 'bg-card text-foreground-muted hover:bg-card-hover'
            }`}
          >
            Shadcn/Recharts Only
          </button>
          <button
            onClick={() => setSelectedLibrary('nivo')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedLibrary === 'nivo'
                ? 'bg-blue-500 text-white'
                : 'bg-card text-foreground-muted hover:bg-card-hover'
            }`}
          >
            Nivo Only
          </button>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto space-y-16">
        {/* TREMOR SECTION */}
        {(selectedLibrary === 'all' || selectedLibrary === 'tremor') && (
          <section>
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-foreground mb-2">
                1. Tremor - The Gold Standard for Fintech
              </h2>
              <p className="text-foreground-muted">
                Stripe/Mercury Bank aesthetic. Pre-built financial components with high contrast and clean white space.
              </p>
            </div>

            <Grid numItemsSm={2} numItemsLg={3} className="gap-6 mb-6">
              {/* Metric Cards with Delta */}
              <TremorCard decoration="top" decorationColor="blue">
                <Text>Total Revenue</Text>
                <Metric>$328,000</Metric>
                <Flex className="mt-4">
                  <Text>vs. last month</Text>
                  <BadgeDelta deltaType="increase">12.3%</BadgeDelta>
                </Flex>
              </TremorCard>

              <TremorCard decoration="top" decorationColor="emerald">
                <Text>Total Profit</Text>
                <Metric>$117,000</Metric>
                <Flex className="mt-4">
                  <Text>vs. last month</Text>
                  <BadgeDelta deltaType="increase">8.7%</BadgeDelta>
                </Flex>
              </TremorCard>

              <TremorCard decoration="top" decorationColor="amber">
                <Text>Avg. Expenses</Text>
                <Metric>$35,167</Metric>
                <Flex className="mt-4">
                  <Text>vs. last month</Text>
                  <BadgeDelta deltaType="moderateDecrease">2.1%</BadgeDelta>
                </Flex>
              </TremorCard>
            </Grid>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Area Chart with Gradient */}
              <TremorCard>
                <Title>Revenue vs Expenses</Title>
                <AreaChart
                  className="h-72 mt-4"
                  data={monthlyPerformance}
                  index="month"
                  categories={['revenue', 'expenses']}
                  colors={['blue', 'red']}
                  valueFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  showLegend={true}
                  showGridLines={false}
                />
              </TremorCard>

              {/* Donut Chart for Portfolio */}
              <TremorCard>
                <Title>Portfolio Allocation</Title>
                <DonutChart
                  className="h-72 mt-4"
                  data={portfolioAllocation}
                  category="value"
                  index="name"
                  valueFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  colors={['blue', 'emerald', 'amber', 'rose', 'violet']}
                  showLabel={true}
                />
              </TremorCard>

              {/* Bar List for Top Spending */}
              <TremorCard>
                <Title>Top Spending Categories</Title>
                <BarList
                  data={categorySpending.map(c => ({ name: c.name, value: c.value }))}
                  className="mt-4"
                  valueFormatter={(value) => `$${value}`}
                  color="blue"
                />
              </TremorCard>

              {/* Line Chart with Sparkline feel */}
              <TremorCard>
                <Title>Profit Trend</Title>
                <TremorLineChart
                  className="h-72 mt-4"
                  data={monthlyPerformance}
                  index="month"
                  categories={['profit']}
                  colors={['emerald']}
                  valueFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  showLegend={false}
                  showGridLines={true}
                  curveType="natural"
                />
              </TremorCard>
            </div>
          </section>
        )}

        {/* SHADCN/RECHARTS SECTION */}
        {(selectedLibrary === 'all' || selectedLibrary === 'recharts') && (
          <section>
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-foreground mb-2">
                2. Shadcn/Recharts - The "Linear" Aesthetic
              </h2>
              <p className="text-foreground-muted">
                Ultra-thin lines, muted grids, sophisticated gradients. High-end developer tool look.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Area Chart with Linear Gradient */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Revenue Growth</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsAreaChart data={monthlyPerformance}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.3} />
                    <XAxis
                      dataKey="month"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#colorRevenue)"
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#colorExpenses)"
                    />
                  </RechartsAreaChart>
                </ResponsiveContainer>
              </div>

              {/* Line Chart with Thin Lines */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Profit Margin Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} />
                    <XAxis
                      dataKey="month"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Chart with Gradient */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Comparison</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyPerformance}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} />
                    <XAxis
                      dataKey="month"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                    <Bar dataKey="revenue" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie Chart with Custom Colors */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Expense Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categorySpending}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => entry.name}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categorySpending.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* NIVO SECTION */}
        {(selectedLibrary === 'all' || selectedLibrary === 'nivo') && (
          <section>
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-foreground mb-2">
                3. Nivo - Complex Wealth Management
              </h2>
              <p className="text-foreground-muted">
                Advanced visualizations with smooth animations. Perfect for portfolio diversification and risk analysis.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Animated Line Chart */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Portfolio vs Expenses</h3>
                <div className="h-[300px]">
                  <ResponsiveLine
                    data={nivoLineData}
                    margin={{ top: 20, right: 110, bottom: 50, left: 60 }}
                    xScale={{ type: 'point' }}
                    yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                    curve="cardinal"
                    axisTop={null}
                    axisRight={null}
                    axisBottom={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: 0,
                    }}
                    axisLeft={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: 0,
                      format: (value) => `$${(value / 1000).toFixed(0)}k`,
                    }}
                    colors={['#3b82f6', '#ef4444']}
                    pointSize={8}
                    pointColor={{ theme: 'background' }}
                    pointBorderWidth={2}
                    pointBorderColor={{ from: 'serieColor' }}
                    pointLabelYOffset={-12}
                    enableArea={true}
                    areaOpacity={0.1}
                    useMesh={true}
                    legends={[
                      {
                        anchor: 'bottom-right',
                        direction: 'column',
                        justify: false,
                        translateX: 100,
                        translateY: 0,
                        itemsSpacing: 0,
                        itemDirection: 'left-to-right',
                        itemWidth: 80,
                        itemHeight: 20,
                        symbolSize: 12,
                        symbolShape: 'circle',
                      },
                    ]}
                    theme={{
                      axis: {
                        ticks: { text: { fill: '#888888' } },
                      },
                      grid: { line: { stroke: '#2a2a2a', strokeWidth: 1 } },
                      tooltip: {
                        container: {
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          fontSize: '12px',
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Interactive Pie Chart */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Asset Allocation</h3>
                <div className="h-[300px]">
                  <ResponsivePie
                    data={nivoPieData}
                    margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
                    innerRadius={0.5}
                    padAngle={0.7}
                    cornerRadius={3}
                    activeOuterRadiusOffset={8}
                    colors={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']}
                    borderWidth={1}
                    borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                    arcLinkLabelsSkipAngle={10}
                    arcLinkLabelsTextColor="#888888"
                    arcLinkLabelsThickness={2}
                    arcLinkLabelsColor={{ from: 'color' }}
                    arcLabelsSkipAngle={10}
                    arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                    valueFormat={(value) => `$${(value / 1000).toFixed(0)}k`}
                    theme={{
                      tooltip: {
                        container: {
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          fontSize: '12px',
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Sunburst for Hierarchical Data */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Expense Breakdown (Sunburst)</h3>
                <div className="h-[400px]">
                  <ResponsiveSunburst
                    data={expenseHierarchy}
                    margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                    id="name"
                    value="value"
                    cornerRadius={2}
                    borderWidth={2}
                    borderColor="white"
                    colors={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']}
                    childColor={{ from: 'color', modifiers: [['brighter', 0.4]] }}
                    enableArcLabels={true}
                    arcLabelsSkipAngle={10}
                    arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                    theme={{
                      tooltip: {
                        container: {
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          fontSize: '12px',
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Calendar Heatmap */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Daily Spending Heatmap</h3>
                <div className="h-[400px]">
                  <ResponsiveCalendar
                    data={generateCalendarData()}
                    from="2025-01-01"
                    to="2025-12-31"
                    emptyColor="#1a1a1a"
                    colors={['#134e4a', '#0f766e', '#14b8a6', '#5eead4']}
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    yearSpacing={40}
                    monthBorderColor="#2a2a2a"
                    dayBorderWidth={2}
                    dayBorderColor="#0a0a0a"
                    theme={{
                      tooltip: {
                        container: {
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          fontSize: '12px',
                        },
                      },
                      labels: {
                        text: { fill: '#888888' },
                      },
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Comparison Summary */}
      <div className="max-w-[1600px] mx-auto mt-16 bg-card rounded-xl p-8 border border-border">
        <h2 className="text-2xl font-bold text-foreground mb-6">Quick Comparison</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-blue-500 mb-3">Tremor</h3>
            <ul className="space-y-2 text-sm text-foreground-muted">
              <li>✓ Pre-built financial components</li>
              <li>✓ Delta badges for changes</li>
              <li>✓ Clean, high-contrast design</li>
              <li>✓ Fast setup with Tailwind</li>
              <li>✗ Less customization</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-emerald-500 mb-3">Shadcn/Recharts</h3>
            <ul className="space-y-2 text-sm text-foreground-muted">
              <li>✓ Fully customizable</li>
              <li>✓ Beautiful gradients</li>
              <li>✓ Ultra-thin modern lines</li>
              <li>✓ High performance</li>
              <li>✗ More setup required</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-violet-500 mb-3">Nivo</h3>
            <ul className="space-y-2 text-sm text-foreground-muted">
              <li>✓ Advanced visualizations</li>
              <li>✓ Smooth animations</li>
              <li>✓ Sunburst, Calendar, Chord</li>
              <li>✓ Premium feel</li>
              <li>✗ Larger bundle size</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
