"""
Finance Tracker - Enhanced Reporting Module
Advanced Reports: Cash Flow, Tax, Year-over-Year, Quarterly
"""
import pandas as pd
from datetime import datetime, date
from typing import Dict, List, Any, Optional


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
