"""
Finance Tracker - Enhanced Reporting Module
Phase 3B: Advanced Reports with Excel Export
"""
import pandas as pd
from datetime import datetime, date
from typing import Dict, List, Any, Optional
import io


class ReportGenerator:
    """Generate advanced financial reports."""
    
    def __init__(self, database):
        self.db = database
    
    # ==================== CASH FLOW STATEMENT ====================
    
    def generate_cash_flow_statement(self, start_date: str, end_date: str, 
                                     account_id: Optional[int] = None) -> Dict[str, Any]:
        """Generate cash flow statement (Operating, Investing, Financing activities)."""
        filters = {
            'start_date': start_date,
            'end_date': end_date
        }
        if account_id:
            filters['account_id'] = account_id
        
        transactions = self.db.get_transactions(filters)
        
        # Initialize categories
        operating_activities = {
            'income': {},
            'expenses': {},
            'total_inflow': 0,
            'total_outflow': 0,
            'net_operating': 0
        }
        
        investing_activities = {
            'purchases': 0,
            'sales': 0,
            'dividends': 0,
            'net_investing': 0
        }
        
        financing_activities = {
            'debt_proceeds': 0,
            'debt_payments': 0,
            'transfers': 0,
            'net_financing': 0
        }
        
        # Categorize transactions
        for trans in transactions:
            amount = trans['amount']
            category = trans['category']
            type_name = trans['type_name']
            
            # Operating Activities
            if category == 'income':
                operating_activities['income'][type_name] = \
                    operating_activities['income'].get(type_name, 0) + amount
                operating_activities['total_inflow'] += amount
                
            elif category == 'expense':
                if type_name not in ['Investment', 'Debt Payment']:
                    operating_activities['expenses'][type_name] = \
                        operating_activities['expenses'].get(type_name, 0) + amount
                    operating_activities['total_outflow'] += amount
            
            # Investing Activities
            if type_name == 'Investment Income':
                if trans['subtype_name'] == 'Dividends':
                    investing_activities['dividends'] += amount
                else:
                    investing_activities['sales'] += amount
            elif type_name == 'Investment':
                investing_activities['purchases'] += amount
            
            # Financing Activities
            if 'debt' in type_name.lower():
                financing_activities['debt_payments'] += amount
            elif category == 'transfer':
                financing_activities['transfers'] += amount
        
        # Calculate nets
        operating_activities['net_operating'] = \
            operating_activities['total_inflow'] - operating_activities['total_outflow']
        
        investing_activities['net_investing'] = \
            investing_activities['sales'] + investing_activities['dividends'] - \
            investing_activities['purchases']
        
        financing_activities['net_financing'] = \
            financing_activities['debt_proceeds'] - financing_activities['debt_payments']
        
        net_cash_flow = (
            operating_activities['net_operating'] +
            investing_activities['net_investing'] +
            financing_activities['net_financing']
        )
        
        return {
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'operating_activities': operating_activities,
            'investing_activities': investing_activities,
            'financing_activities': financing_activities,
            'net_cash_flow': net_cash_flow,
            'generated_at': datetime.now().isoformat()
        }
    
    # ==================== TAX PREPARATION REPORT ====================
    
    def generate_tax_report(self, year: int) -> Dict[str, Any]:
        """Generate tax preparation report with deductible expenses and taxable income."""
        start_date = date(year, 1, 1).isoformat()
        end_date = date(year, 12, 31).isoformat()
        
        filters = {
            'start_date': start_date,
            'end_date': end_date
        }
        
        transactions = self.db.get_transactions(filters)
        
        taxable_income = {
            'salary': 0,
            'investment_income': 0,
            'rental_income': 0,
            'other_income': 0,
            'total': 0
        }
        
        deductible_expenses = {
            'mortgage_interest': 0,
            'property_tax': 0,
            'medical_expenses': 0,
            'charitable_donations': 0,
            'education_expenses': 0,
            'total': 0
        }
        
        investment_details = {
            'dividends': 0,
            'interest': 0,
            'capital_gains': 0
        }
        
        # Categorize transactions
        for trans in transactions:
            amount = trans['amount']
            type_name = trans['type_name']
            subtype_name = trans['subtype_name']
            
            # Income
            if trans['category'] == 'income':
                if type_name == 'Salary':
                    taxable_income['salary'] += amount
                elif type_name == 'Investment Income':
                    taxable_income['investment_income'] += amount
                    if subtype_name == 'Dividends':
                        investment_details['dividends'] += amount
                    elif subtype_name == 'Interest':
                        investment_details['interest'] += amount
                    elif subtype_name == 'Capital Gains':
                        investment_details['capital_gains'] += amount
                    elif subtype_name == 'Rental Income':
                        taxable_income['rental_income'] += amount
                else:
                    taxable_income['other_income'] += amount
            
            # Deductible expenses
            elif trans['category'] == 'expense':
                if type_name == 'Housing':
                    if 'mortgage' in subtype_name.lower():
                        deductible_expenses['mortgage_interest'] += amount * 0.8
                    elif 'tax' in subtype_name.lower():
                        deductible_expenses['property_tax'] += amount
                
                elif type_name == 'Health':
                    deductible_expenses['medical_expenses'] += amount
                
                elif type_name == 'Education':
                    deductible_expenses['education_expenses'] += amount
                
                elif 'donation' in subtype_name.lower() or 'charity' in subtype_name.lower():
                    deductible_expenses['charitable_donations'] += amount
        
        taxable_income['total'] = sum(v for k, v in taxable_income.items() if k != 'total')
        deductible_expenses['total'] = sum(v for k, v in deductible_expenses.items() if k != 'total')
        
        estimated_tax = taxable_income['total'] * 0.25
        
        return {
            'tax_year': year,
            'taxable_income': taxable_income,
            'deductible_expenses': deductible_expenses,
            'investment_details': investment_details,
            'net_taxable_income': taxable_income['total'] - deductible_expenses['total'],
            'estimated_tax': estimated_tax,
            'generated_at': datetime.now().isoformat()
        }
    
    # ==================== YEAR-OVER-YEAR COMPARISON ====================
    
    def generate_yoy_comparison(self, years: List[int]) -> Dict[str, Any]:
        """Generate year-over-year comparison report."""
        comparison_data = {}
        
        for year in years:
            yearly_data = {
                'total_income': 0,
                'total_expenses': 0,
                'net': 0,
                'category_breakdown': {}
            }
            
            for month in range(1, 13):
                month_summary = self.db.get_monthly_summary(year, month)
                yearly_data['total_income'] += month_summary['total_income']
                yearly_data['total_expenses'] += month_summary['total_expenses']
                
                for cat, amt in month_summary['expense_by_category'].items():
                    yearly_data['category_breakdown'][cat] = \
                        yearly_data['category_breakdown'].get(cat, 0) + amt
            
            yearly_data['net'] = yearly_data['total_income'] - yearly_data['total_expenses']
            comparison_data[year] = yearly_data
        
        # Calculate growth rates
        growth_analysis = {}
        sorted_years = sorted(years)
        
        for i in range(1, len(sorted_years)):
            prev_year = sorted_years[i-1]
            curr_year = sorted_years[i]
            
            prev_data = comparison_data[prev_year]
            curr_data = comparison_data[curr_year]
            
            income_growth = ((curr_data['total_income'] - prev_data['total_income']) / 
                           prev_data['total_income'] * 100) if prev_data['total_income'] > 0 else 0
            
            expense_growth = ((curr_data['total_expenses'] - prev_data['total_expenses']) / 
                            prev_data['total_expenses'] * 100) if prev_data['total_expenses'] > 0 else 0
            
            growth_analysis[f"{prev_year}-{curr_year}"] = {
                'income_growth_pct': income_growth,
                'expense_growth_pct': expense_growth,
                'income_change': curr_data['total_income'] - prev_data['total_income'],
                'expense_change': curr_data['total_expenses'] - prev_data['total_expenses']
            }
        
        return {
            'years_compared': years,
            'comparison_data': comparison_data,
            'growth_analysis': growth_analysis,
            'generated_at': datetime.now().isoformat()
        }
    
    # ==================== QUARTERLY REPORTS ====================
    
    def generate_quarterly_report(self, year: int, quarter: int) -> Dict[str, Any]:
        """Generate quarterly financial report (Q1-Q4)."""
        quarter_months = {
            1: (1, 3), 2: (4, 6), 3: (7, 9), 4: (10, 12)
        }
        
        start_month, end_month = quarter_months[quarter]
        start_date = date(year, start_month, 1).isoformat()
        
        if end_month == 12:
            end_date = date(year, 12, 31).isoformat()
        else:
            from datetime import timedelta
            next_month = date(year, end_month + 1, 1)
            end_date = (next_month - timedelta(days=1)).isoformat()
        
        quarterly_summary = {
            'year': year,
            'quarter': quarter,
            'period': f"Q{quarter} {year}",
            'start_date': start_date,
            'end_date': end_date,
            'total_income': 0,
            'total_expenses': 0,
            'net': 0,
            'monthly_breakdown': {},
            'category_breakdown': {'income': {}, 'expense': {}}
        }
        
        for month in range(start_month, end_month + 1):
            month_data = self.db.get_monthly_summary(year, month)
            
            quarterly_summary['total_income'] += month_data['total_income']
            quarterly_summary['total_expenses'] += month_data['total_expenses']
            
            quarterly_summary['monthly_breakdown'][f"{year}-{month:02d}"] = {
                'income': month_data['total_income'],
                'expenses': month_data['total_expenses'],
                'net': month_data['net']
            }
            
            for cat, amt in month_data['income_by_category'].items():
                quarterly_summary['category_breakdown']['income'][cat] = \
                    quarterly_summary['category_breakdown']['income'].get(cat, 0) + amt
            
            for cat, amt in month_data['expense_by_category'].items():
                quarterly_summary['category_breakdown']['expense'][cat] = \
                    quarterly_summary['category_breakdown']['expense'].get(cat, 0) + amt
        
        quarterly_summary['net'] = quarterly_summary['total_income'] - quarterly_summary['total_expenses']
        
        return quarterly_summary
    
    # ==================== EXCEL EXPORT ====================
    
    def export_to_excel(self, report_data: Dict[str, Any], report_type: str) -> bytes:
        """Export report to Excel format with formatting."""
        output = io.BytesIO()
        
        try:
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                workbook = writer.book
                
                header_format = workbook.add_format({
                    'bold': True,
                    'bg_color': '#4ECDC4',
                    'font_color': 'white',
                    'border': 1
                })
                
                currency_format = workbook.add_format({
                    'num_format': '#,##0.00 €',
                    'border': 1
                })
                
                if report_type == 'cash_flow':
                    self._export_cash_flow_excel(report_data, writer, header_format, currency_format)
                elif report_type == 'tax_report':
                    self._export_tax_report_excel(report_data, writer, header_format, currency_format)
                elif report_type == 'yoy_comparison':
                    self._export_yoy_excel(report_data, writer, header_format, currency_format)
        except ImportError:
            raise ImportError("xlsxwriter required for Excel export. Run: pip install xlsxwriter")
        
        output.seek(0)
        return output.getvalue()
    
    def _export_cash_flow_excel(self, data: Dict, writer, header_fmt, curr_fmt):
        """Export cash flow statement to Excel."""
        rows = []
        rows.append(['CASH FLOW STATEMENT', ''])
        rows.append([f"Period: {data['period']['start_date']} to {data['period']['end_date']}", ''])
        rows.append(['', ''])
        rows.append(['OPERATING ACTIVITIES', ''])
        rows.append(['Income:', ''])
        
        for cat, amt in data['operating_activities']['income'].items():
            rows.append([f"  {cat}", amt])
        
        rows.append(['Total Operating Inflows', data['operating_activities']['total_inflow']])
        rows.append(['', ''])
        rows.append(['Expenses:', ''])
        
        for cat, amt in data['operating_activities']['expenses'].items():
            rows.append([f"  {cat}", amt])
        
        rows.append(['Total Operating Outflows', data['operating_activities']['total_outflow']])
        rows.append(['Net Cash from Operating', data['operating_activities']['net_operating']])
        rows.append(['', ''])
        rows.append(['INVESTING ACTIVITIES', ''])
        rows.append(['Purchases', data['investing_activities']['purchases']])
        rows.append(['Sales', data['investing_activities']['sales']])
        rows.append(['Dividends', data['investing_activities']['dividends']])
        rows.append(['Net Cash from Investing', data['investing_activities']['net_investing']])
        rows.append(['', ''])
        rows.append(['FINANCING ACTIVITIES', ''])
        rows.append(['Debt Payments', data['financing_activities']['debt_payments']])
        rows.append(['Net Cash from Financing', data['financing_activities']['net_financing']])
        rows.append(['', ''])
        rows.append(['NET CHANGE IN CASH', data['net_cash_flow']])
        
        df = pd.DataFrame(rows, columns=['Category', 'Amount'])
        df.to_excel(writer, sheet_name='Cash Flow', index=False)
        
        worksheet = writer.sheets['Cash Flow']
        worksheet.set_column('A:A', 40)
        worksheet.set_column('B:B', 15, curr_fmt)
    
    def _export_tax_report_excel(self, data: Dict, writer, header_fmt, curr_fmt):
        """Export tax report to Excel."""
        # Income sheet
        income_rows = []
        for key, value in data['taxable_income'].items():
            if key != 'total':
                income_rows.append([key.replace('_', ' ').title(), value])
        income_rows.append(['TOTAL', data['taxable_income']['total']])
        
        df_income = pd.DataFrame(income_rows, columns=['Category', 'Amount'])
        df_income.to_excel(writer, sheet_name='Income', index=False)
        
        # Deductions sheet
        deduction_rows = []
        for key, value in data['deductible_expenses'].items():
            if key != 'total':
                deduction_rows.append([key.replace('_', ' ').title(), value])
        deduction_rows.append(['TOTAL', data['deductible_expenses']['total']])
        
        df_deduct = pd.DataFrame(deduction_rows, columns=['Category', 'Amount'])
        df_deduct.to_excel(writer, sheet_name='Deductions', index=False)
        
        # Summary sheet
        summary_rows = [
            ['Tax Year', data['tax_year']],
            ['', ''],
            ['Total Income', data['taxable_income']['total']],
            ['Total Deductions', data['deductible_expenses']['total']],
            ['Net Taxable Income', data['net_taxable_income']],
            ['Estimated Tax (25%)', data['estimated_tax']]
        ]
        
        df_summary = pd.DataFrame(summary_rows, columns=['Item', 'Value'])
        df_summary.to_excel(writer, sheet_name='Summary', index=False)
        
        for sheet in writer.sheets:
            worksheet = writer.sheets[sheet]
            worksheet.set_column('A:A', 30)
            worksheet.set_column('B:B', 15, curr_fmt)
    
    def _export_yoy_excel(self, data: Dict, writer, header_fmt, curr_fmt):
        """Export year-over-year comparison to Excel."""
        years = sorted(data['years_compared'])
        
        rows = []
        income_row = ['Income']
        expense_row = ['Expenses']
        net_row = ['Net']
        
        for year in years:
            income_row.append(data['comparison_data'][year]['total_income'])
            expense_row.append(data['comparison_data'][year]['total_expenses'])
            net_row.append(data['comparison_data'][year]['net'])
        
        rows.append(income_row)
        rows.append(expense_row)
        rows.append(net_row)
        
        columns = ['Category'] + [str(y) for y in years]
        df = pd.DataFrame(rows, columns=columns)
        df.to_excel(writer, sheet_name='Comparison', index=False)
        
        worksheet = writer.sheets['Comparison']
        worksheet.set_column('A:A', 20)
        for i in range(len(years)):
            worksheet.set_column(i+1, i+1, 15, curr_fmt)
