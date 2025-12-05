"""
Finance Tracker - Streamlit Application
Main application file
"""
import streamlit as st
from datetime import datetime, date, timedelta
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from pathlib import Path
from database import FinanceDatabase
from categorizer import TransactionCategorizer
from predictions import SpendingPredictor
from alerts import AlertManager
from backup_manager import BackupManager
from auth import AuthManager
from login_page import show_login_page, show_logout_button, check_authentication, show_user_settings
import yfinance as yf
from utils import parse_amount, format_amount

backup_mgr = BackupManager()
alert_manager = AlertManager()

# Page configuration
st.set_page_config(
    page_title="Finance Tracker",
    page_icon="💰",
    layout="wide",
    initial_sidebar_state="collapsed"  # Better for mobile - collapsed by default
)
# Mobile detection
st.components.v1.html("""
<script>
    const isMobile = window.innerWidth <= 768;
    window.parent.postMessage({type: 'streamlit:setComponentValue', value: isMobile}, '*');
</script>
""", height=0)

# Initialize database
@st.cache_resource
def get_database():
    return FinanceDatabase()

db = get_database()

# Initialize authentication manager
@st.cache_resource
def get_auth_manager():
    return AuthManager()

auth_mgr = get_auth_manager()

# Check for auto backup on app load
if backup_mgr.should_auto_backup():
    backup_result = backup_mgr.create_backup('auto', 'Daily automatic backup')
    if backup_result:
        st.toast(f"✅ Auto backup created: {backup_result['filename']}", icon="💾")
# Number formatting helper
def format_number(num, currency=""):
    """Format numbers with space as thousand separator (groups of 3) and comma for decimals"""
    if pd.isna(num):
        return "0,00"
    
    # Split into integer and decimal parts
    is_negative = num < 0
    num = abs(num)
    
    integer_part = int(num)
    decimal_part = num - integer_part
    
    # Format integer part with spaces every 3 digits
    integer_str = f"{integer_part:,}".replace(",", " ")
    
    # Format decimal part
    decimal_str = f"{decimal_part:.2f}"[2:]  # Get the decimal part after "0."
    
    # Combine
    formatted = f"{integer_str},{decimal_str}"
    if is_negative:
        formatted = f"-{formatted}"
    
    return f"{formatted} {currency}".strip() if currency else formatted

# Custom CSS
st.markdown("""
    <style>
    .main {
        background-color: #0E1117;
        color: #FAFAFA;
    }
    .stMetric {
        background-color: #262730;
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid #404040;
    }
    .category-color {
        display: inline-block;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        margin-right: 8px;
        vertical-align: middle;
    }
    /* Mobile Responsive Styles */
@media (max-width: 768px) {
    .big-metric {
        font-size: 1.5rem;
    }
    .stButton button {
        width: 100%;
        padding: 12px;
        font-size: 1.1rem;
    }
    .stSelectbox, .stTextInput, .stNumberInput {
        width: 100% !important;
    }
    div[data-testid="column"] {
        padding: 0 !important;
    }
    .stTabs [data-baseweb="tab-list"] button {
        font-size: 0.9rem;
        padding: 8px;
    }
}

@media (max-width: 480px) {
    .big-metric {
        font-size: 1.2rem;
    }
    .stSidebar {
        width: 100% !important;
    }
}

/* Touch-friendly improvements */
.stButton button {
    min-height: 44px;  /* iOS touch target minimum */
}
.stSelectbox select {
    min-height: 44px;
}
    </style>
""", unsafe_allow_html=True)

# ========== AUTHENTICATION CHECK ==========
if not check_authentication(auth_mgr):
    # Show login page
    show_login_page(auth_mgr)
    st.stop()  # Stop execution here - don't render the rest of the app

# ========== AUTHENTICATED USER AREA ==========

# Sidebar
with st.sidebar:
    # Show logout button and user info
    show_logout_button(auth_mgr)

    st.markdown("---")

    page = st.sidebar.radio(
        "Navigation",
        ["Dashboard", "Add Transaction", "View Transactions", "Manage Accounts",
         "Categories", "Envelopes", "Recurring Transactions", "Debts", "Reports",
         "Work Hours Calculator", "Investments", "Backup", "Settings"]
    )

# Helper function to convert currency using exchange rates
def convert_currency(amount: float, from_currency: str, to_currency: str) -> float:
    """Convert amount from one currency to another using stored exchange rates."""
    if from_currency == to_currency:
        return amount

    # Get exchange rates from preferences (stored as JSON)
    import json
    rates_json = db.get_preference('exchange_rates', '{}')
    try:
        rates = json.loads(rates_json)
    except:
        rates = {}

    # Default exchange rates (relative to EUR)
    default_rates = {
        'EUR': 1.0,
        'DKK': 7.45,
        'SEK': 11.50,
        'USD': 1.10,
        'GBP': 0.85,
        'CHF': 0.95
    }

    # Use stored rates or defaults
    rates = {**default_rates, **rates}

    # Convert via EUR as base currency
    if from_currency not in rates or to_currency not in rates:
        return amount  # Return original if currencies not found

    # Convert to EUR first, then to target currency
    amount_in_eur = amount / rates[from_currency]
    amount_in_target = amount_in_eur * rates[to_currency]

    return amount_in_target

# Helper function to get account options
def get_account_options():
    accounts = db.get_accounts()
    if not accounts:
        return [], {}
    # Include bank name in the account display
    options = []
    for acc in accounts:
        bank_name = acc.get('bank_name') or 'No Bank'
        option = f"{acc['name']} ({bank_name}) - {acc['currency']}"
        options.append(option)
    mapping = {opt: acc['id'] for opt, acc in zip(options, accounts)}
    return options, mapping

# Helper function to get type options
def get_type_options():
    types = db.get_types()
    options = [f"{t['icon']} {t['name']}" for t in types]
    mapping = {opt: t for opt, t in zip(options, types)}
    return options, mapping

# ==================== DASHBOARD ====================
if page == "Dashboard":
    # Get current month (non-modifiable)
    today = date.today()
    start_date = today.replace(day=1)
    end_date = today

    # Display current month prominently
    from datetime import datetime
    current_month_name = datetime.now().strftime('%B %Y')
    st.title(f"📊 Dashboard - {current_month_name}")

    # Get accounts and banks
    accounts = db.get_accounts()
    banks = db.get_banks()

    # Get dashboard display currency from settings
    dashboard_currency = db.get_preference('dashboard_currency', 'DKK')

    # Calculate total value owned across all accounts (converted to dashboard currency)
    total_value_owned = 0.0
    for acc in accounts:
        converted_balance = convert_currency(acc['balance'], acc['currency'], dashboard_currency)
        total_value_owned += converted_balance

    # Calculate total per bank (converted to dashboard currency)
    from collections import defaultdict
    bank_totals = defaultdict(float)
    bank_accounts_map = defaultdict(list)

    for acc in accounts:
        bank_name = acc['bank_name'] or 'No Bank'
        converted_balance = convert_currency(acc['balance'], acc['currency'], dashboard_currency)
        bank_totals[bank_name] += converted_balance
        # Store original account info with converted balance
        acc_with_converted = acc.copy()
        acc_with_converted['converted_balance'] = converted_balance
        bank_accounts_map[bank_name].append(acc_with_converted)

    # Display Total Value Owned
    st.subheader("💰 Total Value Owned")
    col1, col2 = st.columns([1, 2])
    with col1:
        st.metric("Total Balance", format_number(total_value_owned, dashboard_currency))
    with col2:
        st.metric("Total Accounts", len(accounts))

    st.divider()

    # Budget Tracking
    st.subheader("💰 Budget vs Actual Spending")

    budget_comparison = db.get_budget_vs_actual(today.year, today.month)

    if budget_comparison:
        # Display budget progress bars
        for budget_item in budget_comparison:
            col1, col2, col3, col4 = st.columns([2, 1, 1, 1])

            with col1:
                st.write(f"{budget_item['icon']} **{budget_item['type_name']}**")

            with col2:
                st.write(f"Budget: {format_number(budget_item['budget'], dashboard_currency)}")

            with col3:
                st.write(f"Actual: {format_number(budget_item['actual'], dashboard_currency)}")

            with col4:
                # Color based on status
                if budget_item['status'] == 'over':
                    st.write(f"🔴 {budget_item['percentage']:.0f}%")
                elif budget_item['percentage'] > 80:
                    st.write(f"🟡 {budget_item['percentage']:.0f}%")
                else:
                    st.write(f"🟢 {budget_item['percentage']:.0f}%")

            # Progress bar
            progress_value = min(budget_item['percentage'] / 100, 1.0)
            st.progress(progress_value)
    else:
        st.info("No budgets configured. Set up budgets in the Settings page.")

    st.divider()

    # Envelope Progress (Savings Goals)
    st.subheader("🎯 Savings Goals (Envelopes)")

    envelopes = db.get_envelopes()

    if envelopes:
        # Display envelope progress
        for envelope in envelopes:
            envelope_progress = db.get_envelope_progress(envelope['id'])

            col1, col2, col3, col4 = st.columns([2, 1, 1, 1])

            with col1:
                # Show envelope icon/color if available
                envelope_color = envelope_progress.get('color', '#007BFF')
                st.markdown(f"<span style='color: {envelope_color}'>●</span> **{envelope_progress['name']}**", unsafe_allow_html=True)

            with col2:
                st.write(f"Target: {format_number(envelope_progress['target_amount'], dashboard_currency)}")

            with col3:
                st.write(f"Current: {format_number(envelope_progress['current_amount'], dashboard_currency)}")

            with col4:
                # Status indicator
                if envelope_progress['is_complete']:
                    st.write(f"✅ {envelope_progress['percentage']:.0f}%")
                elif envelope_progress['percentage'] >= 75:
                    st.write(f"🟢 {envelope_progress['percentage']:.0f}%")
                elif envelope_progress['percentage'] >= 50:
                    st.write(f"🟡 {envelope_progress['percentage']:.0f}%")
                else:
                    st.write(f"🔴 {envelope_progress['percentage']:.0f}%")

            # Progress bar
            progress_value = min(envelope_progress['percentage'] / 100, 1.0)
            st.progress(progress_value)

            # Show deadline info and monthly target if available
            if envelope_progress['days_remaining'] is not None:
                if envelope_progress['days_remaining'] < 0:
                    st.caption(f"⚠️ Deadline passed {abs(envelope_progress['days_remaining'])} days ago")
                elif envelope_progress['days_remaining'] == 0:
                    st.caption(f"⚠️ Deadline is today!")
                elif envelope_progress['days_remaining'] <= 7:
                    st.caption(f"⏰ {envelope_progress['days_remaining']} days remaining")
                else:
                    st.caption(f"📅 {envelope_progress['days_remaining']} days remaining")

                # Show monthly target if available and goal not reached
                if envelope_progress['monthly_target'] is not None and not envelope_progress['is_complete']:
                    if envelope_progress['monthly_target'] > 0:
                        st.caption(f"💰 Monthly target: {format_number(envelope_progress['monthly_target'], dashboard_currency)}")
    else:
        st.info("No envelopes configured. Create savings goals in the Envelopes page.")

    st.divider()

    # Build filters for current month transactions
    filters = {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat()
    }
    
    # Monthly Transaction Summary
    st.subheader("📊 Monthly Transaction Summary")

    # Fetch transactions for current month
    transactions = db.get_transactions(filters)

    if not transactions:
        st.info(f"No transactions this month ({start_date.strftime('%d/%m/%Y')} - {end_date.strftime('%d/%m/%Y')})")
    else:
        df = pd.DataFrame(transactions)

        # Summary metrics
        col1, col2, col3, col4 = st.columns(4)

        total_income = df[df['category'] == 'income']['amount'].sum()
        total_expense = df[df['category'] == 'expense']['amount'].sum()
        net = total_income - total_expense

        with col1:
            st.metric("Total Income", format_number(total_income, dashboard_currency))
        with col2:
            st.metric("Total Expenses", format_number(total_expense, dashboard_currency))
        with col3:
            st.metric("Net", format_number(net, dashboard_currency))
        with col4:
            st.metric("Transactions", len(df))

        st.divider()

        # Total Value Over Time (Current Year)
        st.subheader("📈 Total Value Over Time - Current Year")

        # Fetch transactions for the entire current year
        year_start = today.replace(month=1, day=1)
        year_filters = {
            'start_date': year_start.isoformat(),
            'end_date': today.isoformat()
        }
        year_transactions = db.get_transactions(year_filters)

        if year_transactions:
            year_df = pd.DataFrame(year_transactions)
            year_df['transaction_date'] = pd.to_datetime(year_df['transaction_date'])
            year_df = year_df.sort_values('transaction_date')

            # Calculate total value day by day
            # Start with balance at beginning of year (current balance - year transactions)
            year_income = year_df[year_df['category'] == 'income']['amount'].sum()
            year_expense = year_df[year_df['category'] == 'expense']['amount'].sum()
            year_net_change = year_income - year_expense

            starting_balance = total_value_owned - year_net_change

            # Group transactions by date and calculate cumulative total
            daily_changes = year_df.groupby(year_df['transaction_date'].dt.date).apply(
                lambda x: (x[x['category'] == 'income']['amount'].sum() -
                          x[x['category'] == 'expense']['amount'].sum())
            ).reset_index()
            daily_changes.columns = ['date', 'net_change']

            # Calculate running total
            daily_changes['total_value'] = starting_balance + daily_changes['net_change'].cumsum()

            # Add starting point
            start_point = pd.DataFrame([{
                'date': year_start,
                'total_value': starting_balance
            }])
            daily_changes = pd.concat([start_point, daily_changes], ignore_index=True)

            fig_balance = px.line(
                daily_changes,
                x='date',
                y='total_value',
                title=f'Total Value Over Time - {today.year}',
                labels={'date': 'Date', 'total_value': f'Total Value ({dashboard_currency})'}
            )
            fig_balance.update_traces(line_color='#00B894', line_width=3)
            fig_balance.update_xaxes(tickformat='%b %d')
            fig_balance.update_layout(hovermode='x unified', height=400)
            st.plotly_chart(fig_balance, use_container_width=True)
        else:
            st.info("No transactions found for the current year.")
        
        # Spending by category (2 pie charts per row)
        st.subheader("📊 Spending by Category")
        expense_df = df[df['category'] == 'expense'].copy()

        if not expense_df.empty:
            # Get unique categories with spending this month
            categories_with_spending = expense_df.groupby(['type_name', 'type_id']).agg({
                'amount': 'sum'
            }).reset_index().sort_values('amount', ascending=False)

            # Create pie charts in 2-column layout
            categories_list = list(categories_with_spending.iterrows())

            for i in range(0, len(categories_list), 2):
                cols = st.columns(2)

                # First chart in the row
                with cols[0]:
                    _, cat_row = categories_list[i]
                    type_name = cat_row['type_name']
                    type_id = cat_row['type_id']

                    # Filter expenses for this category
                    cat_expenses = expense_df[expense_df['type_id'] == type_id].copy()

                    # Group by subtype
                    subtype_spending = cat_expenses.groupby('subtype_name')['amount'].sum().reset_index()
                    subtype_spending = subtype_spending.sort_values('amount', ascending=False)

                    st.markdown(f"### {type_name}")

                    if len(subtype_spending) > 0:
                        # Remove empty or null subtypes
                        subtype_spending['subtype_name'] = subtype_spending['subtype_name'].fillna('Other')
                        subtype_spending['subtype_name'] = subtype_spending['subtype_name'].replace('', 'Other')

                        fig = px.pie(
                            subtype_spending,
                            values='amount',
                            names='subtype_name',
                            title=f'{type_name}<br>({format_number(cat_row["amount"], dashboard_currency)})',
                            hole=0.3
                        )
                        fig.update_traces(
                            textposition='inside',
                            textinfo='percent+label',
                            hovertemplate='<b>%{label}</b><br>Amount: %{value:,.2f}<br>Percentage: %{percent}<extra></extra>'
                        )
                        fig.update_layout(height=400, showlegend=False)
                        st.plotly_chart(fig, use_container_width=True)
                    else:
                        st.caption(f"Total: {format_number(cat_row['amount'], dashboard_currency)}")

                # Second chart in the row (if exists)
                if i + 1 < len(categories_list):
                    with cols[1]:
                        _, cat_row = categories_list[i + 1]
                        type_name = cat_row['type_name']
                        type_id = cat_row['type_id']

                        # Filter expenses for this category
                        cat_expenses = expense_df[expense_df['type_id'] == type_id].copy()

                        # Group by subtype
                        subtype_spending = cat_expenses.groupby('subtype_name')['amount'].sum().reset_index()
                        subtype_spending = subtype_spending.sort_values('amount', ascending=False)

                        st.markdown(f"### {type_name}")

                        if len(subtype_spending) > 0:
                            # Remove empty or null subtypes
                            subtype_spending['subtype_name'] = subtype_spending['subtype_name'].fillna('Other')
                            subtype_spending['subtype_name'] = subtype_spending['subtype_name'].replace('', 'Other')

                            fig = px.pie(
                                subtype_spending,
                                values='amount',
                                names='subtype_name',
                                title=f'{type_name}<br>({format_number(cat_row["amount"], dashboard_currency)})',
                                hole=0.3
                            )
                            fig.update_traces(
                                textposition='inside',
                                textinfo='percent+label',
                                hovertemplate='<b>%{label}</b><br>Amount: %{value:,.2f}<br>Percentage: %{percent}<extra></extra>'
                            )
                            fig.update_layout(height=400, showlegend=False)
                            st.plotly_chart(fig, use_container_width=True)
                        else:
                            st.caption(f"Total: {format_number(cat_row['amount'], dashboard_currency)}")
        else:
            st.info("No expenses in this period")
        
        # Income by category (single pie chart)
        st.subheader("💵 Income by Category")
        income_df = df[df['category'] == 'income'].copy()

        if not income_df.empty:
            # Group by both type and subtype for hierarchical view
            income_grouped = income_df.groupby(['type_name', 'subtype_name'])['amount'].sum().reset_index()
            income_grouped = income_grouped.sort_values('amount', ascending=False)

            # Create labels that show both type and subtype
            income_grouped['label'] = income_grouped.apply(
                lambda row: f"{row['type_name']} - {row['subtype_name']}" if pd.notna(row['subtype_name']) and row['subtype_name'] != '' else row['type_name'],
                axis=1
            )

            fig_income = px.pie(
                income_grouped,
                values='amount',
                names='label',
                title='Income',
                hole=0.3,
                color_discrete_sequence=px.colors.sequential.Greens_r
            )
            fig_income.update_traces(
                textposition='inside',
                textinfo='percent+label',
                hovertemplate='<b>%{label}</b><br>Amount: %{value:,.2f}<br>Percentage: %{percent}<extra></extra>'
            )
            fig_income.update_layout(height=500, showlegend=False)
            st.plotly_chart(fig_income, use_container_width=True)
        else:
            st.info("No income in this period")
        
        # Predictions
        st.markdown("### 🔮 Spending Predictions")

    # Get predictions filtered by dashboard currency to avoid mixing different currencies
    prediction_data = db.get_transactions_for_prediction(months=6, currency=dashboard_currency)

    # Get pending transactions (filtered by currency)
    all_pending = db.get_pending_transactions()
    pending_filtered = [p for p in all_pending if p.get('currency') == dashboard_currency]

    # Calculate future recurring transactions for next month
    from datetime import datetime
    next_month = datetime.now().month + 1 if datetime.now().month < 12 else 1
    next_year = datetime.now().year if datetime.now().month < 12 else datetime.now().year + 1
    future_recurring = db.calculate_future_recurring_transactions(next_year, next_month, currency=dashboard_currency)

    # Get budgets
    budgets = db.get_budgets()

    # Create predictor with enhanced data
    predictor = SpendingPredictor(
        prediction_data,
        pending_transactions=pending_filtered,
        future_recurring=future_recurring,
        budgets=budgets
    )

    pred_col1, pred_col2 = st.columns(2)

    with pred_col1:
        monthly_pred = predictor.predict_monthly_spending()
        if monthly_pred['predicted'] > 0:
            # Show main prediction
            st.metric(
                "Next Month Predicted",
                format_number(monthly_pred['predicted'], dashboard_currency),
                help=f"Confidence: {monthly_pred['confidence']:.0%}"
            )

            # Show breakdown
            with st.expander("📊 Prediction Breakdown"):
                st.write(f"**Base Prediction:** {format_number(monthly_pred['base_prediction'], dashboard_currency)}")
                st.write(f"**Recurring Expenses:** {format_number(monthly_pred['recurring_amount'], dashboard_currency)}")
                if monthly_pred['pending_amount'] > 0:
                    st.write(f"**Pending Transactions:** {format_number(monthly_pred['pending_amount'], dashboard_currency)}")
                st.caption(f"Trend: {monthly_pred.get('trend', 'stable')}")

            # Budget comparison
            budget_info = monthly_pred.get('budget_comparison', {})
            if budget_info.get('has_budget'):
                total_budget = budget_info['total_budget']
                difference = budget_info['difference']

                if budget_info['over_budget']:
                    st.warning(f"⚠️ Prediction exceeds budget by {format_number(abs(difference), dashboard_currency)}")
                    st.caption(f"Budget: {format_number(total_budget, dashboard_currency)} | Predicted: {format_number(monthly_pred['predicted'], dashboard_currency)}")
                else:
                    st.success(f"✅ Under budget by {format_number(abs(difference), dashboard_currency)}")
                    st.caption(f"Budget: {format_number(total_budget, dashboard_currency)} | Predicted: {format_number(monthly_pred['predicted'], dashboard_currency)}")

    with pred_col2:
        anomalies = predictor.detect_anomalies()
        if anomalies:
            st.warning(f"⚠️ {len(anomalies)} unusual transactions detected")
            with st.expander("View Anomalies"):
                for a in anomalies[:5]:
                    st.write(f"**{a['date']}** - {a['type']}")
                    st.write(f"Amount: {format_number(a['amount'], dashboard_currency)} (avg: {format_number(a['average'], dashboard_currency)})")
        else:
            st.success("✅ No spending anomalies detected")

        # Show upcoming recurring transactions count
        if future_recurring:
            recurring_expenses = [r for r in future_recurring if r.get('category') == 'expense']
            if recurring_expenses:
                st.info(f"📅 {len(recurring_expenses)} recurring expense(s) expected next month")
                with st.expander("View Recurring Expenses"):
                    for rec in recurring_expenses[:5]:
                        st.write(f"**{rec['transaction_date']}** - {rec['template_name']}")
                        st.write(f"Amount: {format_number(rec['amount'], dashboard_currency)}")

# ==================== ADD TRANSACTION ====================
elif page == "Add Transaction":
    st.title("➕ Add Transaction")

    # Display success message if exists
    if 'transaction_success_message' in st.session_state and st.session_state.transaction_success_message:
        st.success(st.session_state.transaction_success_message)
        st.balloons()
        # Clear the message after displaying
        st.session_state.transaction_success_message = None

    # Get options
    account_options, account_mapping = get_account_options()
    type_options, type_mapping = get_type_options()
    
    if not account_options:
        st.warning("⚠️ Please create an account first in 'Manage Accounts'")
        st.stop()
    
    # Initialize session state for selected type if not exists
    if 'selected_type' not in st.session_state:
        st.session_state.selected_type = type_options[0] if type_options else None

    # Type selection FIRST - placed at top so page adapts when user selects Transfer
    st.subheader("Transaction Type")

    col_type1, col_type2 = st.columns(2)

    with col_type1:
        # Type selection with callback to update session state
        def on_type_change():
            st.session_state.selected_type = st.session_state.type_selector

        selected_type_idx = type_options.index(st.session_state.selected_type) if st.session_state.selected_type in type_options else 0
        selected_type = st.selectbox(
            "Type",
            type_options,
            index=selected_type_idx,
            key="type_selector",
            on_change=on_type_change
        )

        # Update session state
        st.session_state.selected_type = selected_type

    with col_type2:
        # Get subtypes for selected type
        if selected_type:
            type_data = type_mapping[selected_type]
            subtypes = db.get_subtypes(type_data['id'])
            subtype_options = [s['name'] for s in subtypes]

            # Subtype selection
            if subtype_options:
                # Check if there's a suggested subtype from ML categorization
                subtype_idx = 0
                if 'suggested_subtype' in st.session_state and st.session_state.suggested_subtype in subtype_options:
                    subtype_idx = subtype_options.index(st.session_state.suggested_subtype)
                    # Clear the suggestion after using it
                    del st.session_state.suggested_subtype

                selected_subtype = st.selectbox("Subtype", subtype_options, index=subtype_idx, key="subtype_selector")
            else:
                st.warning("No subtypes available for this type")
                selected_subtype = None

    st.divider()

    # Check if selected type is a transfer (automatically determined by type category)
    is_transfer = False
    if st.session_state.selected_type and st.session_state.selected_type in type_mapping:
        type_data = type_mapping[st.session_state.selected_type]
        is_transfer = type_data.get('category') == 'transfer'

    # Show info message when transfer type is selected
    if is_transfer:
        st.info("💱 Transfer mode: Select source and destination accounts below")

    # Initialize variables
    transfer_account = None
    destinataire = None
    transfer_amount_str = None
    is_currency_conversion = False
    source_currency = None
    dest_currency = None

    st.subheader("Transaction Details")
    col1, col2 = st.columns(2)

    with col1:
        trans_date = st.date_input("Transaction Date", date.today(), key="trans_date_input")

        # Change label based on transfer mode
        if is_transfer:
            selected_account = st.selectbox("From Account (Source)", account_options, key="trans_account")
        else:
            selected_account = st.selectbox("Account", account_options, key="trans_account")

        # Get account currency
        if selected_account:
            account_id = account_mapping[selected_account]
            account = next(a for a in db.get_accounts() if a['id'] == account_id)
            source_currency = account['currency']
        else:
            source_currency = "EUR"

        # Number input with proper formatting hint
        if is_transfer:
            amount_str = st.text_input(
                f"Amount (Source: {source_currency})",
                placeholder="20 000,89 or 2 000",
                help="Amount to transfer from source account",
                key="amount_input"
            )
        else:
            amount_str = st.text_input(
                "Amount",
                placeholder="20 000,89 or 2 000",
                help="Use comma for decimals",
                key="amount_input"
            )

        # Currency selector only for non-transfer transactions
        if not is_transfer:
            # Simple currency list
            currency_list = ["DKK", "SEK", "EUR", "USD", "GBP", "CHF"]
            default_idx = currency_list.index(source_currency) if source_currency in currency_list else 2
            currency = st.selectbox("Currency", currency_list, index=default_idx, key="currency_select")
        else:
            currency = source_currency

    with col2:
        due_date = st.date_input("Due Date (Optional)", value=None, key="trans_due")

        # Conditional recipient field based on transfer status
        if is_transfer:
            # Show transfer account selector
            transfer_options = [opt for opt in account_options if opt != selected_account]
            if transfer_options:
                transfer_account = st.selectbox("To Account (Destination)", transfer_options, key="transfer_to")

                # Check if currencies are different
                if transfer_account:
                    dest_account_id = account_mapping[transfer_account]
                    dest_account = next(a for a in db.get_accounts() if a['id'] == dest_account_id)
                    dest_currency = dest_account['currency']

                    # Show currency conversion field if currencies differ
                    if source_currency != dest_currency:
                        is_currency_conversion = True
                        transfer_amount_str = st.text_input(
                            f"Amount Received (Destination: {dest_currency})",
                            placeholder="20 000,89 or 2 000",
                            help="Amount to be received in destination account",
                            key="transfer_amount_input"
                        )
                        st.info(f"💱 Currency conversion: {source_currency} → {dest_currency}")
            else:
                st.warning("No other accounts available for transfer")
                transfer_account = None
        else:
            # Show recipient/payer field for regular transactions
            # Determine if this is income or expense based on selected type
            is_income_type = False
            if st.session_state.selected_type and st.session_state.selected_type in type_mapping:
                type_data = type_mapping[st.session_state.selected_type]
                is_income_type = type_data.get('category') == 'income'

            previous_recipients = db.get_distinct_recipients()
            recipient_options = ["✍️ Enter New..."] + previous_recipients

            # Change label and placeholder based on transaction type
            if is_income_type:
                field_label = "Payer"
                field_help = "Who is paying you (employer, client, etc.)"
                placeholder_text = "e.g., Company Name, Client Name"
                new_entry_label = "New Payer Name"
            else:
                field_label = "Recipient/Shop"
                field_help = "Select from previous recipients or enter a new one"
                placeholder_text = "e.g., Supermarket, John Doe"
                new_entry_label = "New Recipient Name"

            selected_recipient = st.selectbox(
                field_label,
                recipient_options,
                key="recipient_selector",
                help=field_help
            )

            # Show text input if user wants to enter new recipient/payer
            if selected_recipient == "✍️ Enter New...":
                destinataire = st.text_input(
                    new_entry_label,
                    placeholder=placeholder_text,
                    key="destinataire_input"
                )
            else:
                destinataire = selected_recipient

            # Auto-suggest category based on recipient (show immediately after recipient is entered)
            if destinataire and len(destinataire) > 3:
                categorizer = TransactionCategorizer()
                if categorizer.model:
                    suggestions = categorizer.suggest_categories(destinataire, top_n=3)
                    if suggestions and suggestions[0]['confidence'] > 0.3:
                        # Get the suggested type name from the ID
                        suggested_type_id = suggestions[0]['type_id']
                        suggested_subtype_id = suggestions[0]['subtype_id']

                        # Find the type name from the mapping
                        suggested_type_name = None
                        for type_name, type_data in type_mapping.items():
                            if type_data['id'] == suggested_type_id:
                                suggested_type_name = type_name
                                break

                        # Find the subtype name
                        suggested_subtype_name = None
                        if suggested_type_name:
                            suggested_subtypes = db.get_subtypes(suggested_type_id)
                            for subtype in suggested_subtypes:
                                if subtype['id'] == suggested_subtype_id:
                                    suggested_subtype_name = subtype['name']
                                    break

                        if suggested_type_name and suggested_subtype_name:
                            st.success(f"💡 Suggested: **{suggested_type_name}** → **{suggested_subtype_name}** (confidence: {suggestions[0]['confidence']:.0%})")

                            if st.button("✨ Apply Suggestion", key="apply_suggestion_btn"):
                                st.session_state.selected_type = suggested_type_name
                                st.session_state.suggested_subtype = suggested_subtype_name
                                st.rerun()
                    else:
                        # Low confidence or no suggestion
                        st.caption("ℹ️ No category suggestion available for this recipient (add more transactions to improve ML)")
                else:
                    # Model not trained yet
                    st.caption("ℹ️ Category suggestions will be available after adding more transactions")

    description = st.text_area("Description (Optional)", placeholder="Additional notes...", key="description_input")

    # Tags selection with existing tags
    existing_tags = db.get_distinct_tags()
    tag_options = ["✍️ Enter New Tags..."] + existing_tags

    selected_tag_option = st.selectbox(
        "Tags (Optional)",
        tag_options,
        key="tags_selector",
        help="Select from existing tags or enter new ones (comma-separated)"
    )

    # Show text input if user wants to enter new tags
    if selected_tag_option == "✍️ Enter New Tags...":
        tags = st.text_input(
            "New Tags",
            placeholder="e.g., Travel 2025, Vacation",
            key="tags_input"
        )
    else:
        tags = selected_tag_option

    # Set destinataire for transfers (it was set in col2 for regular transactions)
    if is_transfer:
        if transfer_account:
            destinataire = f"Transfer to {transfer_account}"
        else:
            destinataire = "Transfer"

    # Submit button
    if st.button("💾 Add Transaction", use_container_width=True, key="submit_transaction"):
        if not is_transfer and not destinataire:
            # Dynamic error message based on transaction type
            is_income_type = False
            if st.session_state.selected_type and st.session_state.selected_type in type_mapping:
                type_data = type_mapping[st.session_state.selected_type]
                is_income_type = type_data.get('category') == 'income'

            if is_income_type:
                st.error("❌ Payer is required!")
            else:
                st.error("❌ Recipient/Shop is required!")
        elif is_transfer and not transfer_account:
            st.error("❌ Please select a transfer account!")
        elif not amount_str:
            st.error("❌ Amount is required!")
        elif is_currency_conversion and not transfer_amount_str:
            st.error("❌ Destination amount is required for currency conversion!")
        elif not selected_subtype:
            st.error("❌ Please select a subtype!")
        else:
            try:
                # Parse amount (handle both comma and dot, and spaces)
                amount = parse_amount(amount_str)

                # Parse transfer amount if currency conversion
                transfer_amount = None
                if is_currency_conversion and transfer_amount_str:
                    transfer_amount = float(parse_amount(amount_str))

                if amount <= 0:
                    st.error("❌ Amount must be greater than 0!")
                elif is_currency_conversion and transfer_amount and transfer_amount <= 0:
                    st.error("❌ Destination amount must be greater than 0!")
                else:
                    # Get IDs
                    account_id = account_mapping[selected_account]
                    type_data = type_mapping[selected_type]

                    # Find subtype ID
                    subtypes = db.get_subtypes(type_data['id'])
                    subtype_id = next(s['id'] for s in subtypes if s['name'] == selected_subtype)

                    # Handle currency conversion transfers differently
                    if is_transfer and is_currency_conversion and transfer_amount:
                        # Create transaction for source account (outgoing - negative)
                        dest_account_id = account_mapping[transfer_account]

                        source_transaction_data = {
                            'account_id': account_id,
                            'transaction_date': trans_date.isoformat(),
                            'due_date': due_date.isoformat() if due_date else None,
                            'amount': -amount,  # Negative for outgoing
                            'currency': source_currency,
                            'description': description + f" (Converted to {transfer_amount} {dest_currency})" if description else f"Converted to {transfer_amount} {dest_currency}",
                            'destinataire': f"Transfer to {transfer_account}",
                            'type_id': type_data['id'],
                            'subtype_id': subtype_id,
                            'tags': tags,
                            'is_transfer': True,
                            'transfer_account_id': dest_account_id
                        }

                        source_trans_id = db.add_transaction(source_transaction_data)

                        # Create transaction for destination account (incoming - positive)
                        dest_transaction_data = {
                            'account_id': dest_account_id,
                            'transaction_date': trans_date.isoformat(),
                            'due_date': due_date.isoformat() if due_date else None,
                            'amount': transfer_amount,  # Positive for incoming
                            'currency': dest_currency,
                            'description': description + f" (Converted from {amount} {source_currency})" if description else f"Converted from {amount} {source_currency}",
                            'destinataire': f"Transfer from {selected_account}",
                            'type_id': type_data['id'],
                            'subtype_id': subtype_id,
                            'tags': tags,
                            'is_transfer': True,
                            'transfer_account_id': account_id
                        }

                        dest_trans_id = db.add_transaction(dest_transaction_data)

                        # Set success message
                        st.session_state.transaction_success_message = f"✅ Currency conversion transfer completed!\n📤 Source Transaction #{source_trans_id}: -{amount} {source_currency}\n📥 Destination Transaction #{dest_trans_id}: +{transfer_amount} {dest_currency}"

                    else:
                        # Regular transaction or same-currency transfer
                        transaction_data = {
                            'account_id': account_id,
                            'transaction_date': trans_date.isoformat(),
                            'due_date': due_date.isoformat() if due_date else None,
                            'amount': amount,
                            'currency': currency,
                            'description': description,
                            'destinataire': destinataire,
                            'type_id': type_data['id'],
                            'subtype_id': subtype_id,
                            'tags': tags,
                            'is_transfer': is_transfer,
                            'transfer_account_id': account_mapping.get(transfer_account) if is_transfer and transfer_account else None
                        }

                        trans_id = db.add_transaction(transaction_data)
                        st.session_state.transaction_success_message = f"✅ Transaction #{trans_id} added successfully!"

                    today_spending = db.get_today_spending()
                    daily_alert = alert_manager.check_daily_spending(today_spending)
                    if daily_alert:
                        st.session_state.transaction_success_message += f"\n⚠️ Daily spending alert: €{today_spending:.2f} exceeds your threshold"
                        alert_manager.send_alert_notification(daily_alert)

                    # Clear the form by resetting session state
                    st.session_state.selected_type = type_options[0] if type_options else None
                    st.rerun()
            except ValueError:
                st.error("❌ Invalid amount format! Use format like: 20 000,89 or 2 000")

# ==================== VIEW TRANSACTIONS ====================
elif page == "View Transactions":
    st.title("📋 View Transactions")
    
    # Filters
    with st.expander("🔍 Filters", expanded=True):
        col1, col2, col3 = st.columns(3)

        with col1:
            filter_start = st.date_input("From", date.today() - timedelta(days=30))
        with col2:
            filter_end = st.date_input("To", date.today())
        with col3:
            account_options, account_mapping = get_account_options()
            filter_account = st.selectbox("Account", ["All"] + account_options)

        # Second row of filters
        col4, col5, col6 = st.columns(3)

        with col4:
            # Recipient filter
            recipients = db.get_distinct_recipients()
            filter_recipient = st.selectbox("Recipient/Shop", ["All"] + recipients)

        with col5:
            # Type filter
            type_options, type_mapping = get_type_options()
            filter_type = st.selectbox("Type", ["All"] + type_options)

        with col6:
            # Tags filter
            tags = db.get_distinct_tags()
            filter_tag = st.selectbox("Tag", ["All"] + tags)

    # Build filters
    filters = {
        'start_date': filter_start.isoformat(),
        'end_date': filter_end.isoformat()
    }

    if filter_account != "All":
        filters['account_id'] = account_mapping[filter_account]

    if filter_recipient != "All":
        filters['destinataire'] = filter_recipient

    if filter_type != "All":
        filters['type_id'] = type_mapping[filter_type]['id']

    if filter_tag != "All":
        filters['tags'] = filter_tag
    
    # Fetch and display
    transactions = db.get_transactions(filters)

    if not transactions:
        st.info("No transactions found with these filters.")
    else:
        st.success(f"Found {len(transactions)} transactions")

        # Export option at the top
        col_export, col_spacer = st.columns([1, 3])
        with col_export:
            if st.button("📥 Export to JSON", use_container_width=True):
                json_data = db.export_to_json(filter_start.isoformat(), filter_end.isoformat())
                st.download_button(
                    label="Download JSON",
                    data=json_data,
                    file_name=f"finance_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
                    mime="application/json"
                )

        st.divider()

        # Display transactions as compact single lines with expandable details
        for trans in transactions:
            # Define keys for this transaction
            expand_key = f"expand_trans_{trans['id']}"
            confirm_key = f"confirm_delete_trans_{trans['id']}"
            edit_key = f"edit_trans_{trans['id']}"

            # Single line display with expand button
            col1, col2, col3, col4, col5 = st.columns([2, 3, 2, 2, 0.5])

            with col1:
                st.write(f"**{trans['transaction_date']}**")

            with col2:
                st.write(f"{trans['type_name']} → {trans['subtype_name']}")

            with col3:
                # Format amount with color
                amount_formatted = format_number(trans['amount'], trans['currency'])
                if trans['category'] == 'income':
                    st.markdown(f"<span style='color: green'>+{amount_formatted}</span>", unsafe_allow_html=True)
                elif trans['category'] == 'expense':
                    st.markdown(f"<span style='color: red'>-{amount_formatted}</span>", unsafe_allow_html=True)
                else:
                    st.markdown(f"{amount_formatted}", unsafe_allow_html=True)

            with col4:
                # Display account with bank name and currency
                bank_name = trans.get('bank_name', 'No Bank')
                currency = trans.get('currency', 'EUR')
                if bank_name and bank_name != 'No Bank':
                    st.write(f"{trans['account_name']} ({bank_name}) - {currency}")
                else:
                    st.write(f"{trans['account_name']} - {currency}")

            with col5:
                # Expand/collapse button
                if expand_key not in st.session_state:
                    st.session_state[expand_key] = False

                if st.session_state[expand_key]:
                    if st.button("▼", key=f"collapse_btn_{trans['id']}", help="Hide details"):
                        st.session_state[expand_key] = False
                        st.rerun()
                else:
                    if st.button("▶", key=f"expand_btn_{trans['id']}", help="Show details"):
                        st.session_state[expand_key] = True
                        st.rerun()

            # Expandable details section (shown when expanded)
            if st.session_state.get(expand_key, False):
                with st.container():
                    # Add indentation with empty column
                    _, detail_content = st.columns([0.5, 9.5])

                    with detail_content:
                        # Transaction ID and recipient
                        detail_col1, detail_col2 = st.columns(2)

                        with detail_col1:
                            st.caption(f"**Transaction ID:** #{trans['id']}")
                            # Show Payer for income, Recipient for others
                            if trans['category'] == 'income':
                                st.caption(f"**Payer:** {trans['destinataire']}")
                            else:
                                st.caption(f"**Recipient:** {trans['destinataire']}")
                            # Display account with bank name and currency
                            bank_name = trans.get('bank_name', 'No Bank')
                            currency = trans.get('currency', 'EUR')
                            if bank_name and bank_name != 'No Bank':
                                st.caption(f"**Account:** {trans['account_name']} ({bank_name}) - {currency}")
                            else:
                                st.caption(f"**Account:** {trans['account_name']} - {currency}")
                            st.caption(f"**Owner:** {trans['owner_name']}")

                        with detail_col2:
                            if trans.get('description'):
                                st.caption(f"**Description:** {trans['description']}")
                            if trans.get('tags'):
                                st.caption(f"**Tags:** {trans['tags']}")
                            if trans.get('due_date'):
                                st.caption(f"**Due Date:** {trans['due_date']}")
                            if trans.get('is_transfer'):
                                st.caption("**Type:** Transfer")

                        st.divider()

                        # Action buttons
                        if confirm_key in st.session_state:
                            # Show confirm buttons
                            st.warning("⚠️ Are you sure you want to delete this transaction?")
                            btn_col1, btn_col2 = st.columns(2)

                            with btn_col1:
                                if st.button("✓ Confirm Delete", key=f"confirm_yes_{trans['id']}", type="primary", use_container_width=True):
                                    if db.delete_transaction(trans['id']):
                                        st.toast(f"✅ Transaction #{trans['id']} deleted", icon="✅")
                                        del st.session_state[confirm_key]
                                        st.rerun()
                                    else:
                                        st.toast("❌ Failed to delete transaction", icon="❌")
                                        del st.session_state[confirm_key]

                            with btn_col2:
                                if st.button("✗ Cancel", key=f"confirm_no_{trans['id']}", use_container_width=True):
                                    del st.session_state[confirm_key]
                                    st.rerun()
                        else:
                            # Show edit and delete buttons
                            btn_col1, btn_col2 = st.columns(2)

                            with btn_col1:
                                if st.button("✏️ Edit Transaction", key=f"edit_btn_{trans['id']}", use_container_width=True):
                                    st.session_state[edit_key] = True
                                    st.rerun()

                            with btn_col2:
                                if st.button("🗑️ Delete Transaction", key=f"del_trans_{trans['id']}", use_container_width=True):
                                    st.session_state[confirm_key] = True
                                    st.rerun()

            # Edit form (shown when edit button is clicked)
            if edit_key in st.session_state and st.session_state[edit_key]:
                with st.expander("✏️ Edit Transaction", expanded=True):
                    # Type and subtype selection (OUTSIDE form so they can update dynamically)
                    type_col1, type_col2 = st.columns(2)

                    with type_col1:
                        type_opts, type_map = get_type_options()
                        current_type_name = trans['type_name']

                        # Initialize session state for selected type if not exists
                        type_session_key = f"edit_type_selected_{trans['id']}"
                        if type_session_key not in st.session_state:
                            st.session_state[type_session_key] = current_type_name

                        edit_type_idx = type_opts.index(st.session_state[type_session_key]) if st.session_state[type_session_key] in type_opts else 0
                        edit_type = st.selectbox("Type", type_opts, index=edit_type_idx, key=f"edit_type_{trans['id']}")

                        # Update session state when type changes
                        if edit_type != st.session_state[type_session_key]:
                            st.session_state[type_session_key] = edit_type
                            st.rerun()

                    with type_col2:
                        # Get subtypes for selected type
                        edit_type_data = type_map[edit_type]
                        edit_subtypes = db.get_subtypes(edit_type_data['id'])
                        edit_subtype_options = [s['name'] for s in edit_subtypes]
                        current_subtype_name = trans['subtype_name']

                        # Only use current subtype if it's in the list for selected type
                        if current_subtype_name in edit_subtype_options and edit_type == current_type_name:
                            edit_subtype_idx = edit_subtype_options.index(current_subtype_name)
                        else:
                            edit_subtype_idx = 0

                        edit_subtype = st.selectbox("Subtype", edit_subtype_options, index=edit_subtype_idx, key=f"edit_subtype_{trans['id']}")

                    # Rest of the form
                    with st.form(key=f"edit_form_{trans['id']}"):
                        edit_col1, edit_col2 = st.columns(2)

                        with edit_col1:
                            edit_date = st.date_input("Transaction Date", value=datetime.fromisoformat(trans['transaction_date']).date(), key=f"edit_date_{trans['id']}")
                            edit_amount_str = st.text_input("Amount", value=format_number(trans['amount'], '').replace('\xa0', ' '), key=f"edit_amount_{trans['id']}")
                            edit_currency = st.selectbox("Currency", ["DKK", "SEK", "EUR", "USD", "GBP", "CHF"], index=["DKK", "SEK", "EUR", "USD", "GBP", "CHF"].index(trans['currency']) if trans['currency'] in ["DKK", "SEK", "EUR", "USD", "GBP", "CHF"] else 0, key=f"edit_currency_{trans['id']}")

                        with edit_col2:
                            edit_due_date = st.date_input("Due Date (Optional)", value=datetime.fromisoformat(trans['due_date']).date() if trans.get('due_date') else None, key=f"edit_due_{trans['id']}")

                            # Recipient with autocomplete pattern
                            previous_recipients_edit = db.get_distinct_recipients()
                            recipient_options_edit = ["✍️ Enter New..."] + previous_recipients_edit
                            current_recipient = trans.get('destinataire', '')

                            # Pre-select current recipient if it exists
                            if current_recipient and current_recipient in previous_recipients_edit:
                                recipient_idx = previous_recipients_edit.index(current_recipient) + 1  # +1 because of "Enter New..."
                            else:
                                recipient_idx = 0

                            # Determine label based on transaction type
                            is_income_trans = trans.get('category') == 'income'
                            recipient_label = "Payer" if is_income_trans else "Recipient/Shop"

                            selected_recipient_edit = st.selectbox(
                                recipient_label,
                                recipient_options_edit,
                                index=recipient_idx,
                                key=f"edit_recipient_sel_{trans['id']}"
                            )

                            # Show text input if user wants to enter new recipient
                            if selected_recipient_edit == "✍️ Enter New...":
                                edit_recipient = st.text_input(
                                    f"New {recipient_label}",
                                    value=current_recipient,
                                    key=f"edit_recipient_input_{trans['id']}"
                                )
                            else:
                                edit_recipient = selected_recipient_edit

                        edit_description = st.text_area("Description (Optional)", value=trans.get('description', ''), key=f"edit_desc_{trans['id']}")

                        # Tags selection
                        existing_tags_edit = db.get_distinct_tags()
                        current_tags = trans.get('tags', '')
                        if current_tags and current_tags in existing_tags_edit:
                            tag_idx = existing_tags_edit.index(current_tags) + 1  # +1 because of "Enter New Tags..."
                        else:
                            tag_idx = 0

                        tag_options_edit = ["✍️ Enter New Tags..."] + existing_tags_edit
                        selected_tag_edit = st.selectbox("Tags (Optional)", tag_options_edit, index=tag_idx, key=f"edit_tags_sel_{trans['id']}")

                        if selected_tag_edit == "✍️ Enter New Tags...":
                            edit_tags = st.text_input("New Tags", value=current_tags, placeholder="e.g., Travel 2025, Vacation", key=f"edit_tags_input_{trans['id']}")
                        else:
                            edit_tags = selected_tag_edit

                        # Form buttons
                        form_col1, form_col2 = st.columns(2)
                        with form_col1:
                            submit_edit = st.form_submit_button("💾 Save Changes", use_container_width=True, type="primary")
                        with form_col2:
                            cancel_edit = st.form_submit_button("❌ Cancel", use_container_width=True)

                        if submit_edit:
                            try:
                                # Parse amount
                                edit_amount = parse_amount(edit_amount_str)

                                # Find subtype ID
                                edit_subtype_id = next(s['id'] for s in edit_subtypes if s['name'] == edit_subtype)

                                # Build updates dictionary
                                updates = {
                                    'transaction_date': edit_date.isoformat(),
                                    'due_date': edit_due_date.isoformat() if edit_due_date else None,
                                    'amount': edit_amount,
                                    'currency': edit_currency,
                                    'destinataire': edit_recipient,
                                    'type_id': edit_type_data['id'],
                                    'subtype_id': edit_subtype_id,
                                    'description': edit_description,
                                    'tags': edit_tags
                                }

                                # Update transaction
                                if db.update_transaction(trans['id'], updates):
                                    st.success(f"✅ Transaction #{trans['id']} updated successfully!")
                                    del st.session_state[edit_key]
                                    # Clean up type selection session state
                                    if type_session_key in st.session_state:
                                        del st.session_state[type_session_key]
                                    st.rerun()
                                else:
                                    st.error("❌ Failed to update transaction")
                            except ValueError:
                                st.error("❌ Invalid amount format!")

                        if cancel_edit:
                            del st.session_state[edit_key]
                            # Clean up type selection session state
                            if type_session_key in st.session_state:
                                del st.session_state[type_session_key]
                            st.rerun()

            st.divider()

# ==================== MANAGE ACCOUNTS ====================
elif page == "Manage Accounts":
    st.title("🏦 Manage Accounts")
    
    tab1, tab2, tab3 = st.tabs(["📊 Accounts", "🏛️ Banks", "👤 Owners"])
    
    with tab1:
        st.subheader("Accounts")

        accounts = db.get_accounts()
        if accounts:
            # Group accounts by bank
            from collections import defaultdict
            accounts_by_bank = defaultdict(list)

            for acc in accounts:
                bank_name = acc['bank_name'] or 'No Bank'
                accounts_by_bank[bank_name].append(acc)

            # Sort banks alphabetically, but put "No Bank" at the end
            sorted_banks = sorted([b for b in accounts_by_bank.keys() if b != 'No Bank'])
            if 'No Bank' in accounts_by_bank:
                sorted_banks.append('No Bank')

            # Display accounts grouped by bank
            for bank_name in sorted_banks:
                bank_accounts = accounts_by_bank[bank_name]
                # Calculate total balance for this bank
                total_balance = sum(acc['balance'] for acc in bank_accounts)
                # Get currency from first account (assuming same bank uses same currency)
                bank_currency = bank_accounts[0]['currency'] if bank_accounts else 'DKK'

                bank_icon = "🏛️" if bank_name != 'No Bank' else "💰"
                with st.expander(f"{bank_icon} **{bank_name}** ({len(bank_accounts)} account{'s' if len(bank_accounts) != 1 else ''}) - Total: {format_number(total_balance, bank_currency)}", expanded=False):
                    for acc in bank_accounts:
                        st.markdown(f"### {acc['name']}")
                        col1, col2, col3 = st.columns([2, 2, 1])

                        with col1:
                            st.write(f"**Type:** {acc['account_type'].title()}")
                            st.write(f"**Currency:** {acc['currency']}")
                            st.write(f"**Owner:** {acc['owner_name']}")
                        with col2:
                            st.write(f"**Opening Date:** {acc['opening_date'] or 'N/A'}")
                            if acc['account_type'] == 'investment':
                                # Show linked account instead of balance for investment accounts
                                if acc.get('linked_account_id'):
                                    linked_acc = next((a for a in accounts if a['id'] == acc['linked_account_id']), None)
                                    if linked_acc:
                                        st.write(f"**Linked Account:** {linked_acc['name']}")
                                    else:
                                        st.write(f"**Linked Account:** ⚠️ Not found")
                                else:
                                    st.write(f"**Linked Account:** ⚠️ Not linked")
                            else:
                                # Show balance with validation status
                                latest_val = db.get_latest_balance_validation(acc['id'])
                                if latest_val:
                                    val_icon = "✅" if latest_val['is_match'] else "⚠️"
                                    st.write(f"**Balance:** {format_number(acc['balance'], acc['currency'])} {val_icon}")
                                    st.caption(f"Last checked: {latest_val['validation_date']}")
                                else:
                                    st.write(f"**Balance:** {format_number(acc['balance'], acc['currency'])}")
                                    st.caption("⚠️ Never validated")

                        with col3:
                            # Edit button
                            if st.button("✏️ Edit", key=f"edit_acc_{acc['id']}"):
                                st.session_state[f"editing_account_{acc['id']}"] = True

                            # Delete button
                            if st.button("🗑️ Delete", key=f"del_acc_{acc['id']}"):
                                if db.delete_account(acc['id']):
                                    st.success("Account deleted!")
                                    st.rerun()
                                else:
                                    st.error("Cannot delete account with transactions")

                            # Balance check button (only for non-investment accounts)
                            if acc['account_type'] != 'investment':
                                if st.button("✅ Check Balance", key=f"check_bal_{acc['id']}"):
                                    st.session_state[f"checking_balance_{acc['id']}"] = True

                        # Edit form
                        if st.session_state.get(f"editing_account_{acc['id']}", False):
                            st.divider()
                            st.markdown("**Edit Account**")
                            with st.form(f"edit_account_form_{acc['id']}"):
                                # Check if account has transactions
                                account_has_transactions = False
                                try:
                                    transactions = db.get_transactions({'account_id': acc['id']})
                                    account_has_transactions = len(transactions) > 0
                                except:
                                    account_has_transactions = False

                                # Also check for investment holdings if it's an investment account
                                if acc['account_type'] == 'investment':
                                    try:
                                        holdings = db.get_investment_holdings(account_id=acc['id'])
                                        if holdings and len(holdings) > 0:
                                            account_has_transactions = True
                                    except:
                                        pass

                                col_left, col_right = st.columns(2)

                                with col_left:
                                    new_name = st.text_input("Account Name", value=acc['name'])

                                    # Account type - editable if no transactions, read-only otherwise
                                    if account_has_transactions:
                                        st.text_input("Type (read-only - account has transactions)", value=acc['account_type'].title(), disabled=True)
                                        new_account_type = acc['account_type']  # Keep current type
                                    else:
                                        account_type_options = ["cash", "checking", "savings", "investment"]
                                        current_type_idx = account_type_options.index(acc['account_type']) if acc['account_type'] in account_type_options else 0
                                        new_account_type = st.selectbox("Type", account_type_options, index=current_type_idx, key=f"edit_type_{acc['id']}")

                                    # Currency
                                    currency_options = ["DKK", "SEK", "EUR", "USD", "GBP", "CHF"]
                                    current_currency_idx = currency_options.index(acc['currency']) if acc['currency'] in currency_options else 0
                                    new_currency = st.selectbox("Currency", currency_options, index=current_currency_idx, key=f"edit_curr_{acc['id']}")

                                with col_right:
                                    # Bank selection with autocomplete pattern
                                    banks = db.get_banks()
                                    existing_banks = [b['name'] for b in banks]
                                    bank_options = ["None", "✍️ Add New Bank..."] + existing_banks
                                    current_bank = acc['bank_name'] if acc['bank_name'] else "None"
                                    current_bank_idx = bank_options.index(current_bank) if current_bank in bank_options else 0

                                    selected_bank_option = st.selectbox("Bank", bank_options, index=current_bank_idx, key=f"edit_bank_{acc['id']}")

                                    # Show text input if user wants to add new bank
                                    if selected_bank_option == "✍️ Add New Bank...":
                                        selected_bank = st.text_input(
                                            "New Bank Name",
                                            placeholder="e.g., Chase Bank, Bank of America",
                                            key=f"new_bank_edit_{acc['id']}"
                                        )
                                    else:
                                        selected_bank = selected_bank_option

                                    # Owner
                                    owners = db.get_owners()
                                    owner_options = [o['name'] for o in owners]
                                    current_owner_idx = owner_options.index(acc['owner_name']) if acc['owner_name'] in owner_options else 0
                                    selected_owner = st.selectbox("Owner", owner_options, index=current_owner_idx, key=f"edit_owner_{acc['id']}")

                                    # Opening date
                                    from datetime import datetime
                                    current_date = datetime.fromisoformat(acc['opening_date']).date() if acc['opening_date'] else None
                                    new_opening_date = st.date_input("Opening Date", value=current_date, key=f"edit_date_{acc['id']}")

                                # Balance - only for non-investment accounts
                                new_balance = acc['balance']
                                if new_account_type != 'investment':
                                    new_balance = st.number_input("Balance", value=float(acc['balance']), step=0.01, key=f"edit_bal_{acc['id']}")
                                else:
                                    new_balance = 0  # Investment accounts always have 0 balance
                                    st.info("💡 Investment accounts don't track cash balance (balance is always 0)")

                                # Linked account - only for investment accounts
                                new_linked_account_id = acc.get('linked_account_id')
                                if new_account_type == 'investment':
                                    st.divider()
                                    st.markdown("**Linked Account (Required)**")
                                    all_accounts = db.get_accounts()
                                    non_investment_accounts = [a for a in all_accounts if a['account_type'] != 'investment' and a['id'] != acc['id']]

                                    if not non_investment_accounts:
                                        st.warning("⚠️ No checking/savings accounts available. Create one first!")
                                    else:
                                        # Build options list with bank info
                                        linked_options = ["None (Not linked)"]
                                        for a in non_investment_accounts:
                                            bank_name = a.get('bank_name', 'No Bank')
                                            linked_options.append(f"{a['name']} - {bank_name} ({a['currency']})")

                                        # Find current selection
                                        current_linked_idx = 0
                                        if new_linked_account_id:
                                            current_linked = next((a for a in non_investment_accounts if a['id'] == new_linked_account_id), None)
                                            if current_linked:
                                                bank_name = current_linked.get('bank_name', 'No Bank')
                                                option_str = f"{current_linked['name']} - {bank_name} ({current_linked['currency']})"
                                                if option_str in linked_options:
                                                    current_linked_idx = linked_options.index(option_str)

                                        selected_linked = st.selectbox(
                                            "Linked Account",
                                            linked_options,
                                            index=current_linked_idx,
                                            key=f"edit_linked_{acc['id']}",
                                            help="Select the checking/savings account where cash movements happen"
                                        )

                                        if selected_linked != "None (Not linked)":
                                            # Extract account name from selection (format: "Account Name - Bank Name (Currency)")
                                            selected_account_name = selected_linked.split(" - ")[0]
                                            new_linked_account_id = next(a['id'] for a in non_investment_accounts if a['name'] == selected_account_name)
                                        else:
                                            new_linked_account_id = None

                                st.divider()
                                col_a, col_b = st.columns(2)
                                with col_a:
                                    if st.form_submit_button("💾 Save Changes", use_container_width=True):
                                        # Validate investment accounts have linked account
                                        if new_account_type == 'investment' and not new_linked_account_id:
                                            st.error("Investment accounts require a linked account!")
                                        else:
                                            # Get bank_id
                                            new_bank_id = None
                                            if selected_bank and selected_bank != "None":
                                                # Check if bank exists, create if not
                                                existing_bank = next((b for b in banks if b['name'] == selected_bank), None)
                                                if existing_bank:
                                                    new_bank_id = existing_bank['id']
                                                else:
                                                    # Create new bank
                                                    new_bank_id = db.add_bank(selected_bank)
                                                    st.info(f"✨ Created new bank: {selected_bank}")

                                            # Get owner_id
                                            new_owner_id = next(o['id'] for o in owners if o['name'] == selected_owner)

                                            # Update account
                                            updates = {
                                                'name': new_name,
                                                'account_type': new_account_type,
                                                'currency': new_currency,
                                                'bank_id': new_bank_id,
                                                'owner_id': new_owner_id,
                                                'opening_date': new_opening_date.isoformat() if new_opening_date else None,
                                                'balance': new_balance,
                                                'linked_account_id': new_linked_account_id
                                            }
                                            db.update_account(acc['id'], updates)
                                            st.session_state[f"editing_account_{acc['id']}"] = False
                                            st.success("✅ Account updated!")
                                            st.rerun()
                                with col_b:
                                    if st.form_submit_button("❌ Cancel", use_container_width=True):
                                        st.session_state[f"editing_account_{acc['id']}"] = False
                                        st.rerun()

                        # Balance Check Form
                        if st.session_state.get(f"checking_balance_{acc['id']}", False):
                            st.divider()
                            st.markdown("**✅ Balance Validation**")

                            # Get latest validation
                            latest_validation = db.get_latest_balance_validation(acc['id'])

                            if latest_validation:
                                last_check_date = latest_validation['validation_date']
                                last_match = latest_validation['is_match']
                                status_icon = "✅" if last_match else "⚠️"
                                st.caption(f"{status_icon} Last check: {last_check_date} - {'Matched' if last_match else 'Mismatch'}")

                            # Show checkpoint information
                            try:
                                checkpoint_info = db.calculate_balance_between_validations(acc['id'])
                                st.info(f"📍 **Checkpoint:** Last verified on **{checkpoint_info['starting_date']}** at **{format_number(checkpoint_info['starting_balance'], acc['currency'])}**\n\n"
                                        f"🔢 **{checkpoint_info['transaction_count']} transactions** since then\n\n"
                                        f"💰 **Expected balance:** {format_number(checkpoint_info['calculated_balance'], acc['currency'])}")
                            except Exception as e:
                                st.caption(f"Could not load checkpoint info: {e}")

                            with st.form(f"balance_check_form_{acc['id']}"):
                                st.write("Compare your app balance with your actual bank balance:")

                                col_check1, col_check2 = st.columns(2)

                                with col_check1:
                                    st.metric("App Balance", format_number(acc['balance'], acc['currency']))

                                    validation_date = st.date_input(
                                        "Validation Date",
                                        value=date.today(),
                                        key=f"val_date_{acc['id']}"
                                    )

                                with col_check2:
                                    actual_balance_str = st.text_input(
                                        f"Actual Bank Balance ({acc['currency']})",
                                        placeholder="20 000,89 or 2 000",
                                        help="Enter the balance shown in your bank app/statement",
                                        key=f"actual_bal_{acc['id']}"
                                    )

                                notes = st.text_area(
                                    "Notes (Optional)",
                                    placeholder="e.g., Checked on mobile app, pending transaction not yet shown...",
                                    key=f"val_notes_{acc['id']}"
                                )

                                col_submit, col_cancel = st.columns(2)

                                with col_submit:
                                    if st.form_submit_button("💾 Validate Balance", use_container_width=True):
                                        if not actual_balance_str:
                                            st.error("Please enter the actual bank balance!")
                                        else:
                                            try:
                                                actual_balance = parse_amount(actual_balance_str)

                                                validation_data = {
                                                    'account_id': acc['id'],
                                                    'validation_date': validation_date.isoformat(),
                                                    'system_balance': acc['balance'],
                                                    'actual_balance': actual_balance,
                                                    'notes': notes
                                                }

                                                validation_id = db.add_balance_validation(validation_data)

                                                difference = actual_balance - acc['balance']
                                                is_match = abs(difference) < 0.01

                                                if is_match:
                                                    st.success(f"✅ Perfect match! Balance validated for {validation_date.isoformat()}")
                                                    st.balloons()
                                                else:
                                                    diff_formatted = format_number(abs(difference), acc['currency'])
                                                    if difference > 0:
                                                        st.warning(f"⚠️ Mismatch detected! Bank shows {diff_formatted} MORE than the app.")
                                                    else:
                                                        st.warning(f"⚠️ Mismatch detected! Bank shows {diff_formatted} LESS than the app.")
                                                    st.info("💡 Check for pending transactions or missing entries.")

                                                st.session_state[f"checking_balance_{acc['id']}"] = False
                                                st.rerun()

                                            except ValueError:
                                                st.error("Invalid amount format! Use format like: 20 000,89 or 2 000")

                                with col_cancel:
                                    if st.form_submit_button("❌ Cancel", use_container_width=True):
                                        st.session_state[f"checking_balance_{acc['id']}"] = False
                                        st.rerun()

                            # Show validation history
                            st.markdown("**📜 Validation History**")
                            validations = db.get_balance_validations(acc['id'], limit=5)

                            if validations:
                                for val in validations:
                                    status_icon = "✅" if val['is_match'] else "⚠️"
                                    status_text = "Match" if val['is_match'] else f"Mismatch ({format_number(abs(val['difference']), val['currency'])})"

                                    with st.expander(f"{status_icon} {val['validation_date']} - {status_text}", expanded=False):
                                        col_hist1, col_hist2, col_hist3 = st.columns(3)

                                        with col_hist1:
                                            st.write(f"**App Balance:** {format_number(val['system_balance'], val['currency'])}")

                                        with col_hist2:
                                            st.write(f"**Bank Balance:** {format_number(val['actual_balance'], val['currency'])}")

                                        with col_hist3:
                                            if not val['is_match']:
                                                direction = "more" if val['difference'] > 0 else "less"
                                                st.write(f"**Difference:** {format_number(abs(val['difference']), val['currency'])} {direction}")
                                            else:
                                                st.write(f"**Status:** ✅ Perfect match")

                                        if val['notes']:
                                            st.caption(f"📝 {val['notes']}")
                            else:
                                st.caption("No validation history yet. Validate your balance above!")

                        # Add separator between accounts within the same bank
                        if acc != bank_accounts[-1]:
                            st.divider()
        else:
            st.info("No accounts yet. Create one below.")
        
        st.divider()
        st.subheader("Add New Account")
        
        with st.form("add_account_form"):
            col1, col2 = st.columns(2)

            with col1:
                account_name = st.text_input("Account Name", placeholder="e.g., Main Checking")

                # Simple account type list
                account_type = st.selectbox("Type", ["cash", "checking", "savings", "investment"])

                # Simple currency list
                currency = st.selectbox("Currency", ["DKK", "SEK", "EUR", "USD", "GBP", "CHF"])

            with col2:
                # Bank selection with autocomplete pattern
                banks = db.get_banks()
                existing_banks = [b['name'] for b in banks]
                bank_options = ["None", "✍️ Add New Bank..."] + existing_banks

                selected_bank_option = st.selectbox("Bank", bank_options)

                # Show text input if user wants to add new bank
                if selected_bank_option == "✍️ Add New Bank...":
                    selected_bank = st.text_input(
                        "New Bank Name",
                        placeholder="e.g., Chase Bank, Bank of America",
                        key="new_bank_input"
                    )
                    if selected_bank and selected_bank not in existing_banks:
                        # Will be created when form is submitted
                        pass
                else:
                    selected_bank = selected_bank_option

                owners = db.get_owners()
                owner_options = [o['name'] for o in owners]
                selected_owner = st.selectbox("Owner", owner_options)

                opening_date = st.date_input("Opening Date (Optional)", value=None)

            # Initial balance - only for non-investment accounts
            initial_balance_str = "0"
            if account_type != "investment":
                initial_balance_str = st.text_input("Initial Balance", value="0", help="Use comma for decimals - this will be your verified opening balance")
                st.info("💡 **How opening balance works:**\n"
                        "• The opening balance creates an initial checkpoint\n"
                        "• Transactions dated **before** the opening date are stored as historical (don't affect balance)\n"
                        "• Transactions **on or after** the opening date affect the balance normally\n"
                        "• Use 'Check Balance' to create future checkpoints")

            # Linked account (REQUIRED for investment accounts)
            linked_account_id = None
            if account_type == "investment":
                st.info("💡 Investment accounts track securities only. You MUST link to a checking/savings account where cash movements happen (buy/sell/dividends).")
                all_accounts = db.get_accounts()
                non_investment_accounts = [a for a in all_accounts if a['account_type'] != 'investment']
                if not non_investment_accounts:
                    st.warning("⚠️ You need to create a checking or savings account first before creating an investment account!")
                else:
                    # Build options with bank info
                    linked_options = []
                    for a in non_investment_accounts:
                        bank_name = a.get('bank_name', 'No Bank')
                        linked_options.append(f"{a['name']} - {bank_name} ({a['currency']})")

                    selected_linked = st.selectbox("Linked Account (REQUIRED)", linked_options,
                                                  help="Select the checking/savings account where money will be deducted (for buys) or deposited (for sells/dividends)")
                    # Extract account name from selection (format: "Account Name - Bank Name (Currency)")
                    selected_account_name = selected_linked.split(" - ")[0]
                    linked_account_id = next(a['id'] for a in non_investment_accounts if a['name'] == selected_account_name)

            submitted = st.form_submit_button("➕ Create Account", use_container_width=True)

            if submitted:
                if not account_name:
                    st.error("Account name is required!")
                elif account_type == "investment" and not linked_account_id:
                    st.error("Investment accounts require a linked account!")
                else:
                    try:
                        initial_balance = 0
                        if account_type != "investment":
                            initial_balance = parse_amount(initial_balance_str)

                        bank_id = None
                        if selected_bank and selected_bank != "None":
                            # Check if bank exists, create if not
                            existing_bank = next((b for b in banks if b['name'] == selected_bank), None)
                            if existing_bank:
                                bank_id = existing_bank['id']
                            else:
                                # Create new bank
                                bank_id = db.add_bank(selected_bank)
                                st.info(f"✨ Created new bank: {selected_bank}")

                        owner_id = next(o['id'] for o in owners if o['name'] == selected_owner)

                        account_data = {
                            'name': account_name,
                            'account_type': account_type,
                            'currency': currency,
                            'bank_id': bank_id,
                            'owner_id': owner_id,
                            'opening_date': opening_date.isoformat() if opening_date else None,
                            'balance': initial_balance,
                            'linked_account_id': linked_account_id
                        }

                        acc_id = db.add_account(account_data)
                        st.success(f"✅ Account created successfully!")
                        st.rerun()
                    except ValueError:
                        st.error("❌ Invalid balance format!")
    
    with tab2:
        st.subheader("Banks")
        
        banks = db.get_banks()
        if banks:
            for bank in banks:
                col1, col2 = st.columns([4, 1])
                with col1:
                    st.write(f"🏛️ **{bank['name']}**")
                with col2:
                    if st.button("🗑️", key=f"del_bank_{bank['id']}"):
                        if db.delete_bank(bank['id']):
                            st.success("Bank deleted!")
                            st.rerun()
                        else:
                            st.error("Cannot delete bank with accounts")
        else:
            st.info("No banks yet.")
        
        st.divider()
        with st.form("add_bank_form"):
            bank_name = st.text_input("Bank Name")
            if st.form_submit_button("Add Bank"):
                if bank_name:
                    try:
                        db.add_bank(bank_name)
                        st.success("✅ Bank added!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Error: {str(e)}")
    
    with tab3:
        st.subheader("Owners")
        
        owners = db.get_owners()
        for owner in owners:
            col1, col2 = st.columns([4, 1])
            with col1:
                st.write(f"👤 **{owner['name']}**")
            with col2:
                if st.button("🗑️", key=f"del_owner_{owner['id']}"):
                    if db.delete_owner(owner['id']):
                        st.success("Owner deleted!")
                        st.rerun()
                    else:
                        st.error("Cannot delete owner with accounts")
        
        st.divider()
        with st.form("add_owner_form"):
            owner_name = st.text_input("Owner Name")
            if st.form_submit_button("Add Owner"):
                if owner_name:
                    try:
                        db.add_owner(owner_name)
                        st.success("✅ Owner added!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Error: {str(e)}")

# ==================== CATEGORIES ====================
elif page == "Categories":
    st.title("🏷️ Categories")
    
    tab1, tab2 = st.tabs(["📋 View Categories", "➕ Add New"])
    
    with tab1:
        types = db.get_types()
        
        for t in types:
            # Count subtypes
            subtypes = db.get_subtypes(t['id'])
            subtype_count = len(subtypes)
            
            # Display with color box
            with st.expander(f"{t['icon']} {t['name']} ({t['category'].title()}) ({subtype_count})"):
                col1, col2 = st.columns([3, 1])
                
                with col1:
                    # Show color as a colored box
                    st.markdown(
                        f"""<div style='display: flex; align-items: center;'>
                        <div style='width: 30px; height: 30px; background-color: {t['color']}; 
                        border-radius: 5px; margin-right: 10px;'></div>
                        <span>Color: {t['color']}</span>
                        </div>""", 
                        unsafe_allow_html=True
                    )
                    st.write(f"**Subtypes:** {subtype_count}")
                
                with col2:
                    # Edit type button
                    if st.button("✏️ Edit Type", key=f"edit_type_{t['id']}"):
                        st.session_state[f"editing_type_{t['id']}"] = True
                    
                    # Delete type button
                    if st.button("🗑️ Delete Type", key=f"del_type_{t['id']}"):
                        if db.delete_type(t['id']):
                            st.success("Type deleted!")
                            st.rerun()
                        else:
                            st.error("Cannot delete type with transactions")
                
                # Edit form for type
                if st.session_state.get(f"editing_type_{t['id']}", False):
                    st.divider()
                    with st.form(f"edit_type_form_{t['id']}"):
                        new_name = st.text_input("Name", value=t['name'])
                        new_icon = st.text_input("Icon", value=t['icon'])
                        new_color = st.color_picker("Color", value=t['color'])
                        
                        col_a, col_b = st.columns(2)
                        with col_a:
                            if st.form_submit_button("💾 Save"):
                                db.update_type(t['id'], {
                                    'name': new_name,
                                    'icon': new_icon,
                                    'color': new_color
                                })
                                st.session_state[f"editing_type_{t['id']}"] = False
                                st.success("Type updated!")
                                st.rerun()
                        with col_b:
                            if st.form_submit_button("❌ Cancel"):
                                st.session_state[f"editing_type_{t['id']}"] = False
                                st.rerun()
                
                if subtypes:
                    st.write("**Subtypes:**")
                    for sub in subtypes:
                        col_a, col_b, col_c = st.columns([3, 1, 1])
                        with col_a:
                            st.write(f"  • {sub['name']}")
                        with col_b:
                            if st.button("✏️", key=f"edit_sub_{sub['id']}"):
                                st.session_state[f"editing_subtype_{sub['id']}"] = True
                        with col_c:
                            if st.button("🗑️", key=f"del_sub_{sub['id']}"):
                                if db.delete_subtype(sub['id']):
                                    st.success("Subtype deleted!")
                                    st.rerun()
                                else:
                                    st.error("Cannot delete subtype with transactions")
                        
                        # Edit subtype form
                        if st.session_state.get(f"editing_subtype_{sub['id']}", False):
                            with st.form(f"edit_subtype_form_{sub['id']}"):
                                new_sub_name = st.text_input("Subtype Name", value=sub['name'])
                                
                                col_x, col_y = st.columns(2)
                                with col_x:
                                    if st.form_submit_button("💾 Save"):
                                        db.update_subtype(sub['id'], {'name': new_sub_name})
                                        st.session_state[f"editing_subtype_{sub['id']}"] = False
                                        st.success("Subtype updated!")
                                        st.rerun()
                                with col_y:
                                    if st.form_submit_button("❌ Cancel"):
                                        st.session_state[f"editing_subtype_{sub['id']}"] = False
                                        st.rerun()
    
    with tab2:
        st.subheader("Add New Type")
        with st.form("add_type_form"):
            type_name = st.text_input("Type Name")
            category = st.selectbox("Category", ["expense", "income", "transfer"])
            icon = st.text_input("Icon (emoji)", value="📝")
            color = st.color_picker("Color", value="#4ECDC4")
            
            if st.form_submit_button("Add Type"):
                if type_name:
                    try:
                        db.add_type(type_name, category, icon, color)
                        st.success("✅ Type added!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Error: {str(e)}")
        
        st.divider()
        st.subheader("Add New Subtype")
        
        with st.form("add_subtype_form"):
            types = db.get_types()
            type_options = [f"{t['icon']} {t['name']}" for t in types]
            selected_type = st.selectbox("Type", type_options)
            subtype_name = st.text_input("Subtype Name")
            
            if st.form_submit_button("Add Subtype"):
                if subtype_name and selected_type:
                    try:
                        type_id = types[type_options.index(selected_type)]['id']
                        db.add_subtype(type_id, subtype_name)
                        st.success("✅ Subtype added!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Error: {str(e)}")

# ==================== ENVELOPES ====================
elif page == "Envelopes":
    st.title("🐷 Envelopes (Savings Goals)")
    
    st.info("💡 Track your savings goals! Allocate money from your accounts to virtual envelopes and watch your progress.")
    
    tab1, tab2, tab3 = st.tabs(["📊 My Envelopes", "➕ Add Money", "⚙️ Manage"])
    
    with tab1:
        # Get all envelopes
        envelopes = db.get_envelopes()
        
        if not envelopes:
            st.info("No envelopes yet! Create your first savings goal in the 'Manage' tab.")
        else:
            # Summary metrics
            total_target = sum(env['target_amount'] for env in envelopes)
            total_current = sum(env['current_amount'] for env in envelopes)
            total_progress = (total_current / total_target * 100) if total_target > 0 else 0
            
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Total Target", format_number(total_target, "€"))
            with col2:
                st.metric("Total Saved", format_number(total_current, "€"))
            with col3:
                st.metric("Overall Progress", f"{total_progress:.1f}%")
            
            st.divider()
            
            # Display each envelope
            for env in envelopes:
                progress = db.get_envelope_progress(env['id'])
                
                with st.expander(
                    f"{env['name']} - {format_number(progress['current_amount'], '€')} / {format_number(progress['target_amount'], '€')} ({progress['percentage']}%)",
                    expanded=True
                ):
                    # Progress bar
                    st.progress(min(progress['percentage'] / 100, 1.0))
                    
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.metric("Current", format_number(progress['current_amount'], "€"))
                        st.metric("Target", format_number(progress['target_amount'], "€"))
                    
                    with col2:
                        st.metric("Remaining", format_number(progress['remaining_amount'], "€"))

                        # Show monthly target if deadline is set
                        if progress['monthly_target'] is not None:
                            if progress['monthly_target'] == 0:
                                st.success("🎯 Goal achieved!")
                            elif progress['months_remaining'] and progress['months_remaining'] > 0:
                                st.metric(
                                    f"Monthly Target ({progress['months_remaining']} months)",
                                    format_number(progress['monthly_target'], "€")
                                )
                                st.caption(f"💡 Allocate {format_number(progress['monthly_target'], '€')} per month to reach your goal")
                            else:
                                st.error(f"⚠️ Deadline passed! Need {format_number(progress['monthly_target'], '€')}")

                    with col3:
                        if progress['is_complete']:
                            st.success("🎉 Goal Achieved!")
                        else:
                            st.info(f"📈 {progress['percentage']}% Complete")

                        # Days remaining
                        if progress['days_remaining'] is not None:
                            if progress['days_remaining'] > 0:
                                st.write(f"**Days Left:** {progress['days_remaining']}")
                            elif progress['days_remaining'] == 0:
                                st.warning("⏰ Deadline is today!")
                            else:
                                st.error(f"⚠️ Overdue by {abs(progress['days_remaining'])} days")

                        if env['deadline']:
                            st.write(f"**Deadline:** {env['deadline']}")
                    
                    # Description
                    if env['description']:
                        st.write(f"**Description:** {env['description']}")
                    
                    # Show transaction history
                    if st.checkbox(f"Show history for {env['name']}", key=f"history_{env['id']}"):
                        transactions = db.get_envelope_transactions(env['id'])
                        if transactions:
                            st.write(f"**{len(transactions)} allocation(s):**")
                            for trans in transactions:
                                col_a, col_b, col_c = st.columns([2, 2, 1])
                                with col_a:
                                    st.write(trans['transaction_date'])
                                with col_b:
                                    st.write(trans['account_name'])
                                    if trans['description']:
                                        st.caption(trans['description'])
                                with col_c:
                                    st.write(format_number(trans['amount'], "€"))
                        else:
                            st.info("No allocations yet")
    
    with tab2:
        st.subheader("💰 Allocate Money to Envelope")
        
        envelopes = db.get_envelopes()
        if not envelopes:
            st.warning("Create an envelope first in the 'Manage' tab!")
        else:
            account_options, account_mapping = get_account_options()
            if not account_options:
                st.warning("Create an account first!")
            else:
                col1, col2 = st.columns(2)
                
                with col1:
                    # Select envelope
                    envelope_options = [f"{env['name']}" for env in envelopes]
                    selected_envelope_name = st.selectbox("Envelope", envelope_options, key="alloc_envelope")
                    selected_envelope = next(env for env in envelopes if env['name'] == selected_envelope_name)
                    
                    # Show current progress
                    progress = db.get_envelope_progress(selected_envelope['id'])
                    st.info(f"Current: {format_number(progress['current_amount'], '€')} / {format_number(progress['target_amount'], '€')} ({progress['percentage']}%)")
                    
                    amount_str = st.text_input("Amount to Allocate", placeholder="500,00", key="alloc_amount")
                
                with col2:
                    from_account = st.selectbox("From Account", account_options, key="alloc_account")
                    alloc_date = st.date_input("Date", date.today(), key="alloc_date")
                    description = st.text_input("Description (Optional)", placeholder="Monthly savings", key="alloc_desc")
                
                if st.button("💾 Allocate to Envelope", use_container_width=True, key="submit_allocation"):
                    if not amount_str:
                        st.error("Amount is required!")
                    else:
                        try:
                            amount = parse_amount(amount_str)
                            
                            if amount <= 0:
                                st.error("Amount must be greater than 0!")
                            else:
                                account_id = account_mapping[from_account]
                                
                                envelope_transaction_data = {
                                    'envelope_id': selected_envelope['id'],
                                    'transaction_date': alloc_date.isoformat(),
                                    'amount': amount,
                                    'account_id': account_id,
                                    'description': description
                                }
                                
                                trans_id = db.add_envelope_transaction(envelope_transaction_data)
                                st.success(f"✅ Allocated {format_number(amount, '€')} to {selected_envelope['name']}!")
                                st.balloons()
                                st.rerun()
                        except ValueError:
                            st.error("Invalid amount format!")
    
    with tab3:
        st.subheader("⚙️ Manage Envelopes")
        
        # List existing envelopes
        envelopes = db.get_envelopes(include_inactive=True)
        
        if envelopes:
            st.write("**Your Envelopes:**")
            for env in envelopes:
                col1, col2, col3 = st.columns([3, 1, 1])
                
                with col1:
                    status = "✅" if env['is_active'] else "❌"
                    st.write(f"{status} **{env['name']}** - Target: {format_number(env['target_amount'], '€')}")
                    if env['description']:
                        st.caption(env['description'])
                
                with col2:
                    if st.button("✏️ Edit", key=f"edit_env_{env['id']}"):
                        st.session_state[f"editing_envelope_{env['id']}"] = True
                
                with col3:
                    if env['is_active']:
                        if st.button("🗑️ Delete", key=f"del_env_{env['id']}"):
                            if db.delete_envelope(env['id']):
                                st.success("Envelope deactivated!")
                                st.rerun()
                
                # Edit form
                if st.session_state.get(f"editing_envelope_{env['id']}", False):
                    with st.form(f"edit_env_form_{env['id']}"):
                        new_name = st.text_input("Name", value=env['name'])
                        new_target = st.text_input("Target Amount", value=str(env['target_amount']))
                        new_deadline = st.date_input("Deadline (Optional)", value=datetime.fromisoformat(env['deadline']).date() if env['deadline'] else None)

                        # Tags selection with existing tags (same as Add Transaction)
                        existing_tags_env = db.get_distinct_tags()
                        current_tags_env = env.get('tags', '')
                        tag_options_env = ["✍️ Enter New Tags..."] + existing_tags_env

                        # Pre-select current tag if it exists
                        if current_tags_env and current_tags_env in existing_tags_env:
                            tag_idx_env = existing_tags_env.index(current_tags_env) + 1  # +1 because of "Enter New Tags..."
                        else:
                            tag_idx_env = 0

                        selected_tag_option_env = st.selectbox(
                            "Tags (Optional)",
                            tag_options_env,
                            index=tag_idx_env,
                            key=f"tags_selector_edit_{env['id']}",
                            help="Select from existing tags or enter new ones"
                        )

                        # Show text input if user wants to enter new tags
                        if selected_tag_option_env == "✍️ Enter New Tags...":
                            new_tags = st.text_input(
                                "New Tags",
                                value=current_tags_env,
                                placeholder="vacation, emergency, car",
                                key=f"tags_input_edit_{env['id']}"
                            )
                        else:
                            new_tags = selected_tag_option_env

                        col_a, col_b = st.columns(2)
                        with col_a:
                            if st.form_submit_button("💾 Save"):
                                try:
                                    target_amount = parse_amount(new_target)
                                    db.update_envelope(env['id'], {
                                        'name': new_name,
                                        'target_amount': target_amount,
                                        'deadline': new_deadline.isoformat() if new_deadline else None,
                                        'tags': new_tags
                                    })
                                    st.session_state[f"editing_envelope_{env['id']}"] = False
                                    st.success("Envelope updated!")
                                    st.rerun()
                                except ValueError:
                                    st.error("Invalid amount format!")
                        with col_b:
                            if st.form_submit_button("❌ Cancel"):
                                st.session_state[f"editing_envelope_{env['id']}"] = False
                                st.rerun()
                
                st.divider()
        
        # Create new envelope
        st.subheader("➕ Create New Envelope")

        with st.form("create_envelope_form"):
            col1, col2 = st.columns(2)

            with col1:
                env_name = st.text_input("Envelope Name", placeholder="Emergency Fund")
                target_str = st.text_input("Target Amount", placeholder="5 000,00")

            with col2:
                deadline = st.date_input("Deadline (Optional)", value=None)
                description = st.text_area("Description (Optional)", placeholder="Savings for emergencies")

            # Tags selection with existing tags (same as Add Transaction)
            existing_tags_create = db.get_distinct_tags()
            tag_options_create = ["✍️ Enter New Tags..."] + existing_tags_create

            selected_tag_option_create = st.selectbox(
                "Tags (Optional)",
                tag_options_create,
                key="tags_selector_create_env",
                help="Select from existing tags or enter new ones"
            )

            # Show text input if user wants to enter new tags
            if selected_tag_option_create == "✍️ Enter New Tags...":
                tags = st.text_input(
                    "New Tags",
                    placeholder="vacation, emergency, car",
                    key="tags_input_create_env"
                )
            else:
                tags = selected_tag_option_create

            # Color picker
            color = st.color_picker("Color", value="#4ECDC4")

            if st.form_submit_button("➕ Create Envelope", use_container_width=True):
                if not env_name or not target_str:
                    st.error("Name and target amount are required!")
                else:
                    try:
                        target_amount = parse_amount(target_str)


                        envelope_data = {
                            'name': env_name,
                            'description': description,
                            'target_amount': target_amount,
                            'deadline': deadline.isoformat() if deadline else None,
                            'color': color,
                            'tags': tags
                        }

                        env_id = db.add_envelope(envelope_data)
                        st.success(f"✅ Envelope '{env_name}' created successfully!")
                        st.rerun()
                    except ValueError:
                        st.error("Invalid target amount format!")
        
# ==================== RECURRING TRANSACTIONS ====================
elif page == "Recurring Transactions":
    st.title("🔄 Recurring Transactions")
    
    st.info("💡 Automate repetitive transactions! Create templates that generate pending transactions for you to confirm.")
    
    # Check for pending transactions
    pending = db.get_pending_transactions()
    if pending:
        st.warning(f"⚠️ You have {len(pending)} pending transaction(s) awaiting confirmation!")
    
    tab1, tab2, tab3 = st.tabs(["⏰ Pending", "📋 Templates", "➕ Create Template"])
    
    with tab1:
        st.subheader("⏰ Pending Transactions")
        
        if not pending:
            st.success("✅ No pending transactions. All caught up!")
        else:
            for pend in pending:
                with st.expander(
                    f"{pend['template_name']} - {pend['transaction_date']} - {format_number(pend['amount'], pend['currency'])}",
                    expanded=True
                ):
                    col1, col2, col3 = st.columns([2, 2, 1])
                    
                    with col1:
                        st.write(f"**Template:** {pend['template_name']}")
                        st.write(f"**Date:** {pend['transaction_date']}")
                        st.write(f"**Amount:** {format_number(pend['amount'], pend['currency'])}")
                    
                    with col2:
                        st.write(f"**Account:** {pend['account_name']}")
                        # Show Payer for income, Recipient for others
                        if pend.get('category') == 'income':
                            st.write(f"**Payer:** {pend['destinataire']}")
                        else:
                            st.write(f"**To:** {pend['destinataire']}")
                        st.write(f"**Type:** {pend['type_name']} → {pend['subtype_name']}")
                    
                    with col3:
                        if st.button("✅ Confirm", key=f"confirm_{pend['id']}", use_container_width=True):
                            trans_id = db.confirm_pending_transaction(pend['id'])
                            if trans_id:
                                st.success(f"✅ Confirmed! Transaction #{trans_id} created.")
                                st.rerun()
                        
                        if st.button("❌ Reject", key=f"reject_{pend['id']}", use_container_width=True):
                            if db.reject_pending_transaction(pend['id']):
                                st.success("Rejected and deleted.")
                                st.rerun()
                    
                    if pend['description']:
                        st.caption(f"**Description:** {pend['description']}")
    
    with tab2:
        st.subheader("📋 Recurring Templates")

        # Show toggle to include inactive templates
        show_inactive = st.checkbox("Show paused templates", value=False, key="show_inactive_templates")

        templates = db.get_recurring_templates(include_inactive=show_inactive)
        
        if not templates:
            st.info("No recurring templates yet. Create one in the next tab!")
        else:
            for tmpl in templates:
                # Check if this template is linked to a debt
                is_debt_linked = tmpl.get('linked_debt_id') is not None

                status_icon = "✅" if tmpl['is_active'] else "❌"
                debt_icon = "💳 " if is_debt_linked else ""
                pattern_text = f"{tmpl['recurrence_pattern'].title()}"
                if tmpl['recurrence_interval'] > 1:
                    pattern_text = f"Every {tmpl['recurrence_interval']} {tmpl['recurrence_pattern']}(s)"

                with st.expander(f"{status_icon} {debt_icon}{tmpl['name']} - {pattern_text}"):
                    col1, col2, col3 = st.columns([2, 2, 1])

                    with col1:
                        st.write(f"**Amount:** {format_number(tmpl['amount'], tmpl['currency'])}")
                        st.write(f"**Account:** {tmpl['account_name']}")
                        # Show Payer for income, Recipient for others
                        if tmpl.get('category') == 'income':
                            st.write(f"**Payer:** {tmpl['destinataire']}")
                        else:
                            st.write(f"**To:** {tmpl['destinataire']}")

                    with col2:
                        st.write(f"**Pattern:** {pattern_text}")
                        st.write(f"**Start:** {tmpl['start_date']}")
                        if tmpl['end_date']:
                            st.write(f"**End:** {tmpl['end_date']}")
                        if tmpl['last_generated']:
                            st.write(f"**Last Generated:** {tmpl['last_generated']}")

                    with col3:
                        # If linked to debt, show read-only message
                        if is_debt_linked:
                            st.info("💳 Managed via Debts page")
                        else:
                            # Check if this template is in delete confirmation mode
                            confirm_del_key = f"confirm_del_tmpl_{tmpl['id']}"

                            if confirm_del_key in st.session_state:
                                # Show confirmation buttons
                                st.warning("⚠️ Delete?")
                                if st.button("✓ Yes", key=f"confirm_yes_tmpl_{tmpl['id']}", type="primary"):
                                    if db.delete_recurring_template(tmpl['id']):
                                        st.toast(f"✅ Template '{tmpl['name']}' deleted", icon="✅")
                                        del st.session_state[confirm_del_key]
                                        st.rerun()
                                    else:
                                        st.toast("❌ Failed to delete template", icon="❌")
                                        del st.session_state[confirm_del_key]
                                if st.button("✗ No", key=f"confirm_no_tmpl_{tmpl['id']}"):
                                    del st.session_state[confirm_del_key]
                                    st.rerun()
                            else:
                                # Show normal action buttons
                                if tmpl['is_active']:
                                    if st.button("⏸️ Pause", key=f"pause_{tmpl['id']}"):
                                        db.update_recurring_template(tmpl['id'], {'is_active': 0})
                                        st.success("Template paused")
                                        st.rerun()
                                else:
                                    if st.button("▶️ Resume", key=f"resume_{tmpl['id']}"):
                                        db.update_recurring_template(tmpl['id'], {'is_active': 1})
                                        st.success("Template resumed")
                                        st.rerun()

                                if st.button("🗑️ Delete", key=f"del_tmpl_{tmpl['id']}"):
                                    st.session_state[confirm_del_key] = True
                                    st.rerun()

                    if is_debt_linked:
                        st.caption("ℹ️ This template is automatically managed from the Debts page. Edit the debt to modify payment details.")

                    if tmpl['description']:
                        st.caption(f"**Description:** {tmpl['description']}")
    
    with tab3:
        st.subheader("➕ Create Recurring Template")
        
        account_options, account_mapping = get_account_options()
        type_options, type_mapping = get_type_options()
        
        if not account_options:
            st.warning("Create an account first!")
        else:
            # Initialize session state for selected type if not exists
            if 'recurring_selected_type' not in st.session_state:
                st.session_state.recurring_selected_type = type_options[0] if type_options else None

            col1, col2 = st.columns(2)

            with col1:
                tmpl_name = st.text_input("Template Name", placeholder="e.g., Monthly Rent")
                amount_str = st.text_input("Amount", placeholder="1 200,00")

                from_account = st.selectbox("From Account", account_options, key="rec_account")
                account_id = account_mapping[from_account]
                account = next(a for a in db.get_accounts() if a['id'] == account_id)
                currency = account['currency']

            with col2:
                # Type selection with callback to update session state
                def on_rec_type_change():
                    st.session_state.recurring_selected_type = st.session_state.rec_type_selector

                selected_type_idx = type_options.index(st.session_state.recurring_selected_type) if st.session_state.recurring_selected_type in type_options else 0
                selected_type = st.selectbox(
                    "Type",
                    type_options,
                    index=selected_type_idx,
                    key="rec_type_selector",
                    on_change=on_rec_type_change
                )

                # Update session state
                st.session_state.recurring_selected_type = selected_type

                type_data = type_mapping[selected_type]
                subtypes = db.get_subtypes(type_data['id'])
                subtype_options = [s['name'] for s in subtypes]
                selected_subtype = st.selectbox("Subtype", subtype_options, key="rec_subtype")

            # Recipient/Payer field (outside columns so it appears after type selection)
            # Determine if this is income or expense based on selected type
            is_income_type = False
            if st.session_state.recurring_selected_type and st.session_state.recurring_selected_type in type_mapping:
                type_data = type_mapping[st.session_state.recurring_selected_type]
                is_income_type = type_data.get('category') == 'income'

            previous_recipients = db.get_distinct_recipients()
            recipient_options = ["✍️ Enter New..."] + previous_recipients

            # Change label and placeholder based on transaction type
            if is_income_type:
                field_label = "Payer"
                field_help = "Who is paying you (employer, client, etc.)"
                placeholder_text = "e.g., Company Name, Client Name"
                new_entry_label = "New Payer Name"
            else:
                field_label = "Recipient"
                field_help = "Select from previous recipients or enter a new one"
                placeholder_text = "e.g., Landlord"
                new_entry_label = "New Recipient Name"

            selected_recipient = st.selectbox(
                field_label,
                recipient_options,
                key="rec_recipient_selector",
                help=field_help
            )

            # Show text input if user wants to enter new recipient/payer
            if selected_recipient == "✍️ Enter New...":
                destinataire = st.text_input(
                    new_entry_label,
                    placeholder=placeholder_text,
                    key="rec_destinataire_input"
                )
            else:
                destinataire = selected_recipient

            description = st.text_input("Description (Optional)", placeholder="Monthly payment")
            tags = st.text_input("Tags (Optional)", placeholder="Bills, Housing")
            
            st.divider()
            st.subheader("Recurrence Settings")
            
            col_a, col_b, col_c = st.columns(3)
            
            with col_a:
                pattern = st.selectbox(
                    "Pattern",
                    ["daily", "weekly", "monthly", "yearly", "custom"],
                    format_func=lambda x: x.title()
                )
            
            with col_b:
                if pattern == "custom":
                    interval = st.number_input("Every X days", min_value=1, value=1)
                elif pattern in ["daily", "weekly"]:
                    interval = st.number_input(f"Every X {pattern}", min_value=1, value=1)
                else:
                    interval = 1
                    st.info(f"Interval: {interval}")
            
            with col_c:
                day_of_month = None
                if pattern == "monthly":
                    day_of_month = st.number_input("Day of month", min_value=1, max_value=28, value=1)
            
            col_x, col_y = st.columns(2)
            with col_x:
                start_date = st.date_input("Start Date", date.today())
            with col_y:
                end_date = st.date_input("End Date (Optional)", value=None)
            
            if st.button("➕ Create Recurring Template", use_container_width=True):
                if not tmpl_name or not amount_str or not destinataire:
                    # Dynamic error message based on transaction type
                    if is_income_type:
                        st.error("Name, amount, and payer are required!")
                    else:
                        st.error("Name, amount, and recipient are required!")
                else:
                    try:
                        amount = parse_amount(amount_str)
                        
                        account_id = account_mapping[from_account]
                        subtype_id = next(s['id'] for s in subtypes if s['name'] == selected_subtype)
                        
                        template_data = {
                            'name': tmpl_name,
                            'account_id': account_id,
                            'amount': amount,
                            'currency': currency,
                            'description': description,
                            'destinataire': destinataire,
                            'type_id': type_data['id'],
                            'subtype_id': subtype_id,
                            'tags': tags,
                            'recurrence_pattern': pattern,
                            'recurrence_interval': interval,
                            'day_of_month': day_of_month,
                            'start_date': start_date.isoformat(),
                            'end_date': end_date.isoformat() if end_date else None
                        }
                        
                        tmpl_id = db.add_recurring_template(template_data)
                        st.success(f"✅ Recurring template '{tmpl_name}' created!")
                        st.balloons()
                        st.rerun()
                    except ValueError:
                        st.error("Invalid amount format!")
    
    # Manual trigger to generate pending
    st.divider()
    st.info("💡 This button checks **ALL** overdue recurring transactions and generates **one transaction per missed period**. For example, if a weekly payment was missed for 3 weeks, it creates 3 separate pending transactions.")

    if st.button("🔄 Generate ALL Overdue Recurring Transactions", type="primary", use_container_width=True):
        with st.spinner("Checking all recurring templates for overdue periods..."):
            count = db.generate_pending_from_templates()
        if count > 0:
            st.success(f"✅ Generated {count} new pending transaction(s)!")
            st.balloons()
            st.info("📋 Go to the **'⏰ Pending'** tab above to review and confirm each transaction.")
            st.rerun()
        else:
            st.success("✅ All caught up! No overdue recurring transactions found.")

# ==================== DEBTS ====================
elif page == "Debts":
    st.title("💳 Debt Tracking")
    st.info("📝 Track loans, mortgages, and other debts. **Monthly payments are automated** via recurring transactions - confirm them in the Recurring Transactions page. Use the **Extra Payment** tab to make additional principal payments.")
    
    tab1, tab2, tab3 = st.tabs(["📊 My Debts", "💵 Extra Payment", "➕ Add Debt"])
    
    with tab1:
        st.subheader("📊 My Debts")
        
        debts = db.get_debts()
        
        if not debts:
            st.info("No debts tracked yet. Add one in the 'Add Debt' tab!")
        else:
            # Summary metrics
            total_balance = sum(d['current_balance'] for d in debts)
            total_monthly = sum(d['monthly_payment'] for d in debts)
            
            col1, col2 = st.columns(2)
            with col1:
                st.metric("Total Debt Balance", format_number(total_balance, "€"))
            with col2:
                st.metric("Total Monthly Payments", format_number(total_monthly, "€"))
            
            st.divider()
            
            # Display each debt
            for debt in debts:
                payoff_info = db.calculate_debt_payoff(debt['id'])
                
                progress = ((debt['principal_amount'] - debt['current_balance']) / debt['principal_amount'] * 100) if debt['principal_amount'] > 0 else 0
                
                with st.expander(
                    f"💳 {debt['name']} - Balance: {format_number(debt['current_balance'], '€')} ({progress:.1f}% paid)",
                    expanded=True
                ):
                    # Progress bar
                    st.progress(min(progress / 100, 1.0))
                    
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.write(f"**Original Amount:** {format_number(debt['principal_amount'], '€')}")
                        st.write(f"**Current Balance:** {format_number(debt['current_balance'], '€')}")
                        st.write(f"**Interest Rate:** {debt['interest_rate']}% ({debt['interest_type'].title()})")
                    
                    with col2:
                        st.write(f"**Monthly Payment:** {format_number(debt['monthly_payment'], '€')}")
                        st.write(f"**Payment Day:** {debt['payment_day']} of each month")
                        if debt['linked_account_id']:
                            st.write(f"**Account:** {debt['account_name']}")
                    
                    with col3:
                        if not payoff_info.get('is_paid_off'):
                            st.write(f"**Months Remaining:** {payoff_info.get('months_remaining', 'N/A')}")
                            if payoff_info.get('payoff_date'):
                                st.write(f"**Payoff Date:** {payoff_info['payoff_date']}")
                            st.write(f"**Interest Remaining:** {format_number(payoff_info.get('total_interest_remaining', 0), '€')}")
                        else:
                            st.success("🎉 Paid Off!")
                    
                    # Show payment history
                    if st.checkbox(f"Show payment history for {debt['name']}", key=f"history_{debt['id']}"):
                        payments = db.get_debt_payments(debt['id'])
                        if payments:
                            st.write(f"**{len(payments)} payment(s):**")
                            for pay in payments:
                                col_a, col_b, col_c, col_d = st.columns(4)
                                with col_a:
                                    st.write(pay['payment_date'])
                                with col_b:
                                    st.write(f"Total: {format_number(pay['amount'], '€')}")
                                with col_c:
                                    st.write(f"Principal: {format_number(pay['principal_paid'], '€')}")
                                with col_d:
                                    if pay['extra_payment'] > 0:
                                        st.write(f"Extra: {format_number(pay['extra_payment'], '€')}")
                        else:
                            st.info("No payments recorded yet")
                    
                    # Actions
                    col_x, col_y = st.columns(2)
                    with col_x:
                        if st.button("✏️ Edit", key=f"edit_debt_{debt['id']}"):
                            st.session_state[f"editing_debt_{debt['id']}"] = True
                            st.rerun()
                    with col_y:
                        if st.button("🗑️ Delete", key=f"del_debt_{debt['id']}"):
                            if db.delete_debt(debt['id']):
                                st.success("Debt deactivated!")
                                st.rerun()

                    # Edit form (shown when edit button clicked)
                    if st.session_state.get(f"editing_debt_{debt['id']}", False):
                        st.divider()
                        st.markdown("**Edit Debt**")

                        with st.form(f"edit_debt_form_{debt['id']}"):
                            col_left, col_right = st.columns(2)

                            with col_left:
                                edit_name = st.text_input("Debt Name", value=debt['name'], key=f"edit_name_{debt['id']}")
                                edit_principal = st.number_input("Original Amount", value=float(debt['principal_amount']), step=100.0, key=f"edit_principal_{debt['id']}")
                                edit_current = st.number_input("Current Balance", value=float(debt['current_balance']), step=100.0, key=f"edit_current_{debt['id']}")
                                edit_rate = st.number_input("Interest Rate (%)", value=float(debt['interest_rate']), step=0.1, key=f"edit_rate_{debt['id']}")

                            with col_right:
                                edit_monthly = st.number_input("Monthly Payment", value=float(debt['monthly_payment']), step=10.0, key=f"edit_monthly_{debt['id']}")
                                edit_day = st.number_input("Payment Day of Month", min_value=1, max_value=31, value=int(debt['payment_day']), key=f"edit_day_{debt['id']}")
                                edit_type = st.selectbox("Interest Type", ["simple", "compound"], index=0 if debt['interest_type'] == 'simple' else 1, key=f"edit_type_{debt['id']}")

                                # Linked account
                                accounts = db.get_accounts()
                                account_options = [f"{a['name']} - {a.get('bank_name', 'No Bank')} ({a['currency']})" for a in accounts if a['account_type'] != 'investment']

                                # Find current account
                                current_account_idx = 0
                                if debt['linked_account_id']:
                                    for i, acc in enumerate([a for a in accounts if a['account_type'] != 'investment']):
                                        if acc['id'] == debt['linked_account_id']:
                                            current_account_idx = i
                                            break

                                selected_account_str = st.selectbox("Linked Account", account_options, index=current_account_idx, key=f"edit_account_{debt['id']}")
                                # Extract account name from selection
                                selected_account_name = selected_account_str.split(" - ")[0]
                                edit_account_id = next(a['id'] for a in accounts if a['name'] == selected_account_name and a['account_type'] != 'investment')

                            st.divider()
                            col_save, col_cancel = st.columns(2)

                            with col_save:
                                if st.form_submit_button("💾 Save Changes", use_container_width=True):
                                    updates = {
                                        'name': edit_name,
                                        'principal_amount': edit_principal,
                                        'current_balance': edit_current,
                                        'interest_rate': edit_rate,
                                        'monthly_payment': edit_monthly,
                                        'payment_day': edit_day,
                                        'interest_type': edit_type,
                                        'linked_account_id': edit_account_id
                                    }
                                    if db.update_debt(debt['id'], updates):
                                        st.session_state[f"editing_debt_{debt['id']}"] = False
                                        st.success("✅ Debt updated!")
                                        st.rerun()
                                    else:
                                        st.error("Failed to update debt")

                            with col_cancel:
                                if st.form_submit_button("❌ Cancel", use_container_width=True):
                                    st.session_state[f"editing_debt_{debt['id']}"] = False
                                    st.rerun()
    
    with tab2:
        st.subheader("💵 Extra Payment")

        debts = db.get_debts()
        if not debts:
            st.warning("Create a debt first!")
        else:
            st.info("💡 Record extra payments beyond your regular monthly payment. Regular monthly payments are handled automatically through recurring transactions.")

            # Select debt
            debt_options = [f"{d['name']} - Balance: {format_number(d['current_balance'], '€')}" for d in debts]
            selected_debt_name = st.selectbox("Select Debt", debt_options)
            selected_debt = debts[debt_options.index(selected_debt_name)]

            # Show debt info
            col_info1, col_info2 = st.columns(2)
            with col_info1:
                st.write(f"**Current Balance:** {format_number(selected_debt['current_balance'], '€')}")
                st.write(f"**Monthly Payment:** {format_number(selected_debt['monthly_payment'], '€')}")
            with col_info2:
                st.write(f"**Interest Rate:** {selected_debt['interest_rate']}% ({selected_debt['interest_type'].title()})")
                st.write(f"**Next Payment:** {selected_debt['payment_day']} of each month")

            st.divider()

            col1, col2 = st.columns(2)

            with col1:
                payment_date = st.date_input("Extra Payment Date", date.today())
                extra_payment = st.text_input(
                    "Extra Payment Amount",
                    placeholder="1 000,00",
                    help="Additional amount beyond regular payment (goes entirely to principal)"
                )

            with col2:
                # Account selection - default to linked account
                account_options, account_mapping = get_account_options()
                if account_options:
                    # Find the linked account in the options
                    linked_account_name = None
                    for acc_name, acc_id in account_mapping.items():
                        if acc_id == selected_debt['linked_account_id']:
                            linked_account_name = acc_name
                            break

                    # Set default index to linked account if found
                    default_idx = 0
                    if linked_account_name and linked_account_name in account_options:
                        default_idx = account_options.index(linked_account_name)

                    payment_account = st.selectbox(
                        "Payment Account",
                        account_options,
                        index=default_idx,
                        help="Account from which the extra payment will be deducted"
                    )
                else:
                    st.error("No accounts available!")
                    payment_account = None

                st.info("💡 **Extra payments go directly to principal**, reducing the total interest you'll pay over the life of the loan.")
            
            st.divider()

            if st.button("💵 Record Extra Payment", use_container_width=True):
                if not extra_payment or not extra_payment.strip():
                    st.error("Extra payment amount is required!")
                elif not payment_account:
                    st.error("Please select a payment account!")
                else:
                    try:
                        # Parse extra payment amount
                        extra = parse_amount(extra_payment)

                        if extra <= 0:
                            st.error("Extra payment must be greater than 0!")
                            st.stop()
                    except ValueError as e:
                        st.error(f"❌ Invalid payment format! Please use: 1234,56 or 1234.56")
                        st.caption(f"You entered: '{extra_payment}'")
                        st.stop()

                    try:
                        # Use selected payment account
                        account_id = account_mapping[payment_account]

                        # Get or create Debt type and subtype for this specific debt
                        debt_type_id, debt_subtype_id = db.get_or_create_debt_subtype(selected_debt['name'])

                        # Create transaction for extra payment
                        trans_data = {
                            'account_id': account_id,
                            'transaction_date': payment_date.isoformat(),
                            'amount': extra,
                            'currency': 'EUR',  # Default
                            'description': f"Extra payment: {selected_debt['name']}",
                            'destinataire': selected_debt['name'],
                            'type_id': debt_type_id,
                            'subtype_id': debt_subtype_id,
                            'tags': 'Extra Debt Payment'
                        }
                        trans_id = db.add_transaction(trans_data)

                        # Record extra payment (goes directly to principal, no interest)
                        payment_data = {
                            'debt_id': selected_debt['id'],
                            'transaction_id': trans_id,
                            'payment_date': payment_date.isoformat(),
                            'amount': 0,  # No regular payment
                            'extra_payment': extra
                        }

                        pay_id = db.add_debt_payment(payment_data)

                        # Update debt balance directly (extra payment goes to principal)
                        new_balance = selected_debt['current_balance'] - extra
                        db.update_debt(selected_debt['id'], {'current_balance': new_balance})

                        # Check if debt is fully paid off
                        if new_balance <= 0:
                            st.success(f"🎉 CONGRATULATIONS! Debt fully paid off!")
                            st.write(f"**Payment Account:** {payment_account}")
                            st.write(f"**Previous Balance:** {format_number(selected_debt['current_balance'], '€')}")
                            st.write(f"**Final Payment:** {format_number(extra, '€')}")
                            if new_balance < 0:
                                st.write(f"**Overpayment:** {format_number(abs(new_balance), '€')} (you paid {format_number(abs(new_balance), '€')} more than needed)")
                            st.write(f"**Final Balance:** {format_number(new_balance, '€')}")
                            st.info("💡 The recurring payment template has been automatically deleted since this debt is now fully paid!")
                        else:
                            st.success(f"✅ Extra payment of {format_number(extra, '€')} recorded!")
                            st.write(f"**Payment Account:** {payment_account}")
                            st.write(f"**Previous Balance:** {format_number(selected_debt['current_balance'], '€')}")
                            st.write(f"**Extra Principal Payment:** {format_number(extra, '€')}")
                            st.write(f"**New Balance:** {format_number(new_balance, '€')}")

                        st.balloons()

                        # Auto-refresh after 2 seconds
                        import time
                        time.sleep(2)
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Error recording extra payment: {str(e)}")
                        import traceback
                        st.code(traceback.format_exc())
    
    with tab3:
        st.subheader("➕ Add New Debt")

        col1, col2 = st.columns(2)

        with col1:
            # Debt name with autocomplete pattern (reuse existing creditor names)
            existing_debts = db.get_debts(include_inactive=True)
            existing_debt_names = [d['name'] for d in existing_debts]
            debt_name_options = ["✍️ Enter New..."] + existing_debt_names

            selected_debt_option = st.selectbox(
                "Debt Name (Creditor)",
                debt_name_options,
                key="debt_name_selector",
                help="Select from existing creditors or enter a new one"
            )

            # Show text input if user wants to enter new debt name
            if selected_debt_option == "✍️ Enter New...":
                debt_name = st.text_input(
                    "New Debt Name",
                    placeholder="e.g., Car Loan, Mortgage",
                    key="debt_name_input"
                )
            else:
                debt_name = selected_debt_option
            principal_str = st.text_input("Original Amount", placeholder="20 000,00")
            current_balance_str = st.text_input("Current Balance", placeholder="18 500,00", help="Leave same as original if new debt")
            interest_rate = st.number_input("Interest Rate (%)", min_value=0.0, max_value=100.0, value=3.5, step=0.1)
        
        with col2:
            # Interest type with explanation
            interest_type = st.selectbox(
                "Interest Type",
                ["simple", "compound"],
                format_func=lambda x: f"{x.title()} Interest"
            )
            
            if interest_type == "simple":
                st.info("**Simple Interest:** Interest calculated only on principal. Total interest = Principal × Rate × Time")
            else:
                st.info("**Compound Interest:** Interest calculated on principal + accumulated interest. Common for most loans.")
            
            monthly_payment_str = st.text_input("Monthly Payment", placeholder="500,00")
            payment_day = st.number_input("Payment Day of Month", min_value=1, max_value=28, value=1)
            start_date = st.date_input("Start Date", date.today())
        
        # Link to account (REQUIRED)
        st.markdown("### 🔗 Link to Account")
        st.info("💡 Linking an account is required to automatically track monthly payments through recurring transactions.")

        account_options, account_mapping = get_account_options()
        if not account_options:
            st.error("⚠️ You must create at least one account before adding a debt. Go to 'Manage Accounts' to create one.")
        else:
            link_account = st.selectbox("Select Account *", account_options, help="Account from which payments will be deducted")

        if st.button("➕ Add Debt", use_container_width=True):
            if not account_options:
                st.error("Please create an account first!")
            elif not debt_name or not principal_str or not monthly_payment_str:
                st.error("Debt name, principal amount, and monthly payment are required!")
            else:
                try:
                    # Parse amounts
                    principal = parse_amount(principal_str)
                    current_balance = parse_amount(current_balance_str) if current_balance_str else principal
                    monthly_payment = parse_amount(monthly_payment_str)

                    # Account is always linked (mandatory)
                    linked_account_id = account_mapping[link_account]
                    
                    debt_data = {
                        'name': debt_name,
                        'principal_amount': principal,
                        'current_balance': current_balance,
                        'interest_rate': interest_rate,
                        'interest_type': interest_type,
                        'monthly_payment': monthly_payment,
                        'payment_day': payment_day,
                        'start_date': start_date.isoformat(),
                        'linked_account_id': linked_account_id
                    }
                    
                    debt_id = db.add_debt(debt_data)
                    st.success(f"✅ Debt '{debt_name}' added successfully!")
                    st.balloons()
                    st.rerun()
                except ValueError as e:
                    st.error(f"❌ Invalid number format! Please use format: 1 234,56 or 1234,56")
                    st.caption(f"Debug: Could not convert one of the amounts: '{principal_str}', '{current_balance_str}', '{monthly_payment_str}'")

# ==================== REPORTS ====================
elif page == "Reports":
    st.title("📊 Reports & Analytics")
    
    st.info("📈 Analyze your finances with detailed reports and visualizations")
    
    tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs([
        "📅 Monthly Summary",
        "📈 Spending Trends",
        "💰 Budget vs Actual",
        "📊 Income vs Expenses",
        "💎 Net Worth",
        "🏷️ Tag Report"
    ])
    
    # ===== TAB 1: MONTHLY SUMMARY =====
    with tab1:
        st.subheader("📅 Monthly Summary Report")
        
        col1, col2, col3 = st.columns([2, 2, 1])
        with col1:
            report_year = st.number_input("Year", min_value=2000, max_value=2100, value=date.today().year)
        with col2:
            report_month = st.selectbox("Month", range(1, 13), index=date.today().month - 1,
                                       format_func=lambda x: date(2000, x, 1).strftime('%B'))
        with col3:
            if st.button("🔄 Refresh"):
                st.rerun()
        
        summary = db.get_monthly_summary(report_year, report_month)
        
        # Summary metrics
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("💵 Total Income", format_number(summary['total_income'], "€"))
        with col2:
            st.metric("💳 Total Expenses", format_number(summary['total_expenses'], "€"))
        with col3:
            net_color = "normal" if summary['net'] >= 0 else "inverse"
            st.metric("💰 Net", format_number(summary['net'], "€"), delta_color=net_color)
        
        st.divider()
        
        # Income breakdown
        if summary['income_by_category']:
            st.subheader("💵 Income Breakdown")
            
            income_df = pd.DataFrame([
                {'Category': k, 'Amount': v} 
                for k, v in summary['income_by_category'].items()
            ])
            
            fig_income = px.pie(income_df, values='Amount', names='Category', 
                               title='Income by Category',
                               color_discrete_sequence=px.colors.qualitative.Set3)
            st.plotly_chart(fig_income, use_container_width=True)
        
        # Expense breakdown
        if summary['expense_by_category']:
            st.subheader("💳 Expense Breakdown")

            # Prepare data for sunburst chart with subcategories
            expense_detailed = summary.get('expense_by_category_detailed', {})

            if expense_detailed:
                # Create hierarchical data for grouped bar chart
                chart_data = []

                for category, data in expense_detailed.items():
                    for subcat, amount in data['subcategories'].items():
                        chart_data.append({
                            'Category': category,
                            'Subcategory': subcat,
                            'Amount': amount,
                            'Label': f"{category} - {subcat}"
                        })

                chart_df = pd.DataFrame(chart_data)

                # Sort by category total, then by subcategory amount
                category_totals = chart_df.groupby('Category')['Amount'].sum().sort_values(ascending=False)
                chart_df['Category'] = pd.Categorical(chart_df['Category'], categories=category_totals.index, ordered=True)
                chart_df = chart_df.sort_values(['Category', 'Amount'], ascending=[True, False])

                col_a, col_b = st.columns([2, 1])

                with col_a:
                    # Grouped bar chart showing categories with subcategory breakdown
                    fig_expense = px.bar(
                        chart_df,
                        x='Category',
                        y='Amount',
                        color='Subcategory',
                        title='Expenses by Category and Subcategory',
                        labels={'Amount': 'Amount (€)', 'Category': 'Category'},
                        color_discrete_sequence=px.colors.qualitative.Set3,
                        barmode='stack'
                    )
                    fig_expense.update_layout(
                        height=500,
                        xaxis_tickangle=-45,
                        legend_title_text='Subcategory'
                    )
                    st.plotly_chart(fig_expense, use_container_width=True)

                with col_b:
                    st.write("**Category Breakdown:**")

                    # Sort categories by total amount
                    sorted_categories = sorted(
                        expense_detailed.items(),
                        key=lambda x: x[1]['total'],
                        reverse=True
                    )

                    for category, data in sorted_categories[:5]:
                        total_amt = data['total']
                        pct = (total_amt / summary['total_expenses'] * 100)

                        st.write(f"**{category}**")
                        st.write(f"{format_number(total_amt, '€')} ({pct:.1f}%)")

                        # Show subcategories in expander
                        with st.expander(f"View {category} subcategories"):
                            sorted_subcat = sorted(
                                data['subcategories'].items(),
                                key=lambda x: x[1],
                                reverse=True
                            )
                            for subcat, amt in sorted_subcat:
                                subcat_pct = (amt / total_amt * 100) if total_amt > 0 else 0
                                st.write(f"  • {subcat}: {format_number(amt, '€')} ({subcat_pct:.1f}%)")

                        st.progress(min(pct / 100, 1.0))

            else:
                # Fallback to simple bar chart if detailed data not available
                expense_df = pd.DataFrame([
                    {'Category': k, 'Amount': v}
                    for k, v in summary['expense_by_category'].items()
                ]).sort_values('Amount', ascending=False)

                col_a, col_b = st.columns([2, 1])

                with col_a:
                    fig_expense = px.bar(expense_df, x='Category', y='Amount',
                                        title='Expenses by Category',
                                        color='Amount',
                                        color_continuous_scale='Reds')
                    st.plotly_chart(fig_expense, use_container_width=True)

                with col_b:
                    st.write("**Top 5 Categories:**")
                    for _, row in expense_df.head(5).iterrows():
                        pct = (row['Amount'] / summary['total_expenses'] * 100)
                        st.write(f"**{row['Category']}**")
                        st.write(f"{format_number(row['Amount'], '€')} ({pct:.1f}%)")
                        st.progress(min(pct / 100, 1.0))
        
        # Export
        st.divider()
        if st.button("📥 Export to CSV"):
            # Create CSV
            import io
            output = io.StringIO()
            output.write(f"Monthly Summary Report,{report_year}-{report_month:02d}\n\n")
            output.write(f"Total Income,{summary['total_income']}\n")
            output.write(f"Total Expenses,{summary['total_expenses']}\n")
            output.write(f"Net,{summary['net']}\n\n")

            # Export detailed expense breakdown with subcategories
            if summary.get('expense_by_category_detailed'):
                output.write("Expense Category,Subcategory,Amount\n")
                for cat, data in sorted(summary['expense_by_category_detailed'].items(), key=lambda x: x[1]['total'], reverse=True):
                    for subcat, amt in sorted(data['subcategories'].items(), key=lambda x: x[1], reverse=True):
                        output.write(f"{cat},{subcat},{amt}\n")
            else:
                # Fallback to simple export
                output.write("Expense Category,Amount\n")
                for cat, amt in summary['expense_by_category'].items():
                    output.write(f"{cat},{amt}\n")

            st.download_button(
                label="Download CSV",
                data=output.getvalue(),
                file_name=f"monthly_summary_{report_year}_{report_month:02d}.csv",
                mime="text/csv"
            )
    
    # ===== TAB 2: SPENDING TRENDS =====
    with tab2:
        st.subheader("📈 Spending Trends")
        
        col1, col2, col3 = st.columns(3)
        with col1:
            trend_start = st.date_input("From", date.today().replace(month=1, day=1), key="trend_start")
        with col2:
            trend_end = st.date_input("To", date.today(), key="trend_end")
        with col3:
            group_by = st.selectbox("Group By", ["month", "quarter", "year"])
        
        trends = db.get_spending_trends(trend_start.isoformat(), trend_end.isoformat(), group_by)
        
        if not trends['trends']:
            st.info("No data for this period")
        else:
            # Total spending over time
            trend_data = []
            for period, data in sorted(trends['trends'].items()):
                trend_data.append({
                    'Period': period,
                    'Total': data['total']
                })
            
            trend_df = pd.DataFrame(trend_data)
            
            fig_trend = px.line(trend_df, x='Period', y='Total',
                               title='Total Spending Over Time',
                               markers=True)
            fig_trend.update_layout(yaxis_title="Amount (€)")
            st.plotly_chart(fig_trend, use_container_width=True)
            
            # Category breakdown
            st.subheader("Spending by Category")
            
            # Prepare data for stacked bar chart
            category_trend = {}
            for period, data in sorted(trends['trends'].items()):
                for cat, amt in data['by_category'].items():
                    if cat not in category_trend:
                        category_trend[cat] = {}
                    category_trend[cat][period] = amt
            
            cat_df_data = []
            for cat, periods in category_trend.items():
                for period, amt in periods.items():
                    cat_df_data.append({'Period': period, 'Category': cat, 'Amount': amt})
            
            if cat_df_data:
                cat_df = pd.DataFrame(cat_df_data)
                
                fig_cat = px.bar(cat_df, x='Period', y='Amount', color='Category',
                                title='Spending by Category Over Time',
                                barmode='stack')
                st.plotly_chart(fig_cat, use_container_width=True)
    
    # ===== TAB 3: BUDGET VS ACTUAL =====
    with tab3:
        st.subheader("💰 Budget vs Actual")
        
        col1, col2 = st.columns([3, 1])
        with col1:
            bud_year = st.number_input("Year", min_value=2000, max_value=2100, value=date.today().year, key="bud_year")
            bud_month = st.selectbox("Month", range(1, 13), index=date.today().month - 1,
                                    format_func=lambda x: date(2000, x, 1).strftime('%B'), key="bud_month")
        with col2:
            if st.button("⚙️ Manage Budgets"):
                st.session_state['show_budget_manager'] = True
        
        # Budget manager
        if st.session_state.get('show_budget_manager', False):
            with st.expander("⚙️ Budget Manager", expanded=True):
                budgets = db.get_budgets(include_inactive=True)
                
                if budgets:
                    for bud in budgets:
                        col_a, col_b, col_c, col_d = st.columns([2, 2, 1, 1])
                        with col_a:
                            status = "✅" if bud['is_active'] else "❌"
                            st.write(f"{status} {bud['icon']} {bud['type_name']}")
                        with col_b:
                            st.write(f"{format_number(bud['amount'], '€')} / {bud['period']}")
                        with col_c:
                            if st.button("✏️", key=f"edit_bud_{bud['id']}"):
                                st.session_state[f"editing_budget_{bud['id']}"] = True
                        with col_d:
                            if st.button("🗑️", key=f"del_bud_{bud['id']}"):
                                db.delete_budget(bud['id'])
                                st.rerun()
                
                st.divider()
                st.write("**Add New Budget:**")

                type_options, type_mapping = get_type_options()
                expense_types = [opt for opt in type_options if type_mapping[opt]['category'] == 'expense']

                with st.form("add_budget_form"):
                    col_x, col_y, col_z = st.columns(3)
                    with col_x:
                        new_bud_type = st.selectbox("Category", expense_types, key="new_bud_type")
                    with col_y:
                        new_bud_amount = st.text_input("Amount", placeholder="500,00", key="new_bud_amt")
                    with col_z:
                        new_bud_period = st.selectbox("Period", ["monthly", "yearly"], key="new_bud_period")

                    submit_budget = st.form_submit_button("➕ Add Budget")

                    if submit_budget:
                        if new_bud_amount:
                            try:
                                amount = parse_amount(new_bud_amount)
                                type_data = type_mapping[new_bud_type]

                                budget_data = {
                                    'type_id': type_data['id'],
                                    'amount': amount,
                                    'period': new_bud_period,
                                    'start_date': date.today().isoformat()
                                }
                                db.add_budget(budget_data)
                                st.success("Budget added!")
                                st.rerun()
                            except ValueError:
                                st.error("Invalid amount!")
        
        # Show comparison
        comparison = db.get_budget_vs_actual(bud_year, bud_month)
        
        if not comparison:
            st.info("No budgets set. Create budgets above to track spending.")
        else:
            for item in comparison:
                with st.container():
                    col1, col2, col3, col4 = st.columns([2, 2, 2, 1])
                    
                    with col1:
                        st.write(f"{item['icon']} **{item['type_name']}**")
                    
                    with col2:
                        st.write(f"Budget: {format_number(item['budget'], '€')}")
                        st.write(f"Actual: {format_number(item['actual'], '€')}")
                    
                    with col3:
                        if item['status'] == 'over':
                            st.error(f"Over by {format_number(abs(item['difference']), '€')}")
                        elif item['status'] == 'under':
                            st.success(f"Under by {format_number(item['difference'], '€')}")
                        else:
                            st.info("Exact match!")
                        
                        st.progress(min(item['percentage'] / 100, 1.0))
                    
                    with col4:
                        st.metric("Usage", f"{item['percentage']:.0f}%", label_visibility="hidden")
                    
                    st.divider()
    
    # ===== TAB 4: INCOME VS EXPENSES =====
    with tab4:
        st.subheader("📊 Income vs Expenses Trend")
        
        col1, col2, col3 = st.columns(3)
        with col1:
            ie_start = st.date_input("From", date.today().replace(month=1, day=1), key="ie_start")
        with col2:
            ie_end = st.date_input("To", date.today(), key="ie_end")
        with col3:
            ie_group = st.selectbox("Group By", ["month", "quarter", "year"], key="ie_group")
        
        ie_trends = db.get_income_vs_expenses_trend(ie_start.isoformat(), ie_end.isoformat(), ie_group)
        
        if not ie_trends['trends']:
            st.info("No data for this period")
        else:
            # Prepare data
            ie_data = []
            for period, data in sorted(ie_trends['trends'].items()):
                ie_data.append({
                    'Period': period,
                    'Income': data['income'],
                    'Expenses': data['expenses'],
                    'Net': data['net']
                })
            
            ie_df = pd.DataFrame(ie_data)
            
            # Line chart
            fig_ie = go.Figure()
            fig_ie.add_trace(go.Scatter(x=ie_df['Period'], y=ie_df['Income'],
                                       mode='lines+markers', name='Income',
                                       line=dict(color='#00B894', width=3)))
            fig_ie.add_trace(go.Scatter(x=ie_df['Period'], y=ie_df['Expenses'],
                                       mode='lines+markers', name='Expenses',
                                       line=dict(color='#FF6B6B', width=3)))
            fig_ie.add_trace(go.Scatter(x=ie_df['Period'], y=ie_df['Net'],
                                       mode='lines+markers', name='Net',
                                       line=dict(color='#4ECDC4', width=3, dash='dash')))
            
            fig_ie.update_layout(title='Income vs Expenses Over Time',
                                yaxis_title='Amount (€)',
                                hovermode='x unified')
            st.plotly_chart(fig_ie, use_container_width=True)
            
            # Summary table
            st.write("**Summary:**")
            st.dataframe(ie_df.style.format({
                'Income': lambda x: format_number(x, '€'),
                'Expenses': lambda x: format_number(x, '€'),
                'Net': lambda x: format_number(x, '€')
            }), use_container_width=True)
    
    # ===== TAB 5: NET WORTH =====
    with tab5:
        st.subheader("💎 Net Worth")

        net_worth_data = db.get_net_worth()
        display_currency = net_worth_data.get('currency', 'EUR')

        # Main metrics
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("💰 Total Assets", format_number(net_worth_data['total_assets'], display_currency))
        with col2:
            st.metric("💳 Total Debts", format_number(net_worth_data['total_debts'], display_currency))
        with col3:
            net_color = "normal" if net_worth_data['net_worth'] >= 0 else "inverse"
            st.metric("💎 Net Worth", format_number(net_worth_data['net_worth'], display_currency), delta_color=net_color)

        st.divider()

        # Net Worth Trend Charts
        st.subheader("📈 Net Worth Trends")

        trend_col1, trend_col2 = st.columns(2)

        with trend_col1:
            st.write("**Month-to-Month Trend**")
            # Get monthly trend for last 12 months
            from datetime import date
            from dateutil.relativedelta import relativedelta
            start_monthly = (date.today() - relativedelta(months=12)).isoformat()
            monthly_trend = db.get_net_worth_trend(start_date=start_monthly, frequency='monthly')

            if monthly_trend['data']:
                monthly_df = pd.DataFrame(monthly_trend['data'])
                monthly_df['date'] = pd.to_datetime(monthly_df['date'])
                monthly_df['date_label'] = monthly_df['date'].dt.strftime('%b %Y')

                fig_monthly = go.Figure()

                # Net worth line
                fig_monthly.add_trace(go.Scatter(
                    x=monthly_df['date'],
                    y=monthly_df['net_worth'],
                    mode='lines+markers',
                    name='Net Worth',
                    line=dict(color='#2E86AB', width=3),
                    marker=dict(size=8),
                    hovertemplate='%{x|%b %Y}<br>Net Worth: ' + format_number(0, display_currency).replace('0', '%{y:,.2f}') + '<extra></extra>'
                ))

                # Calculate change from previous month
                if len(monthly_df) > 1:
                    current_nw = monthly_df.iloc[-1]['net_worth']
                    previous_nw = monthly_df.iloc[-2]['net_worth']
                    change = current_nw - previous_nw
                    change_pct = (change / abs(previous_nw) * 100) if previous_nw != 0 else 0

                    annotation_text = f"Last Month: {format_number(change, display_currency)} ({change_pct:+.1f}%)"
                    fig_monthly.add_annotation(
                        text=annotation_text,
                        xref="paper", yref="paper",
                        x=0.5, y=1.05,
                        showarrow=False,
                        font=dict(size=12, color='green' if change >= 0 else 'red')
                    )

                fig_monthly.update_layout(
                    xaxis_title='Month',
                    yaxis_title=f'Net Worth ({display_currency})',
                    height=400,
                    hovermode='x unified',
                    showlegend=False
                )

                st.plotly_chart(fig_monthly, use_container_width=True)
            else:
                st.info("No monthly trend data available")

        with trend_col2:
            st.write("**Year-to-Year Trend**")
            # Get yearly trend for last 5 years
            start_yearly = (date.today() - relativedelta(years=5)).isoformat()
            yearly_trend = db.get_net_worth_trend(start_date=start_yearly, frequency='yearly')

            if yearly_trend['data']:
                yearly_df = pd.DataFrame(yearly_trend['data'])
                yearly_df['date'] = pd.to_datetime(yearly_df['date'])
                yearly_df['year'] = yearly_df['date'].dt.year

                fig_yearly = go.Figure()

                # Net worth line
                fig_yearly.add_trace(go.Scatter(
                    x=yearly_df['date'],
                    y=yearly_df['net_worth'],
                    mode='lines+markers',
                    name='Net Worth',
                    line=dict(color='#2E86AB', width=3),
                    marker=dict(size=8),
                    hovertemplate='%{x|%Y}<br>Net Worth: ' + format_number(0, display_currency).replace('0', '%{y:,.2f}') + '<extra></extra>'
                ))

                # Calculate year-over-year change
                if len(yearly_df) > 1:
                    current_nw = yearly_df.iloc[-1]['net_worth']
                    previous_nw = yearly_df.iloc[-2]['net_worth']
                    change = current_nw - previous_nw
                    change_pct = (change / abs(previous_nw) * 100) if previous_nw != 0 else 0

                    annotation_text = f"Year-over-Year: {format_number(change, display_currency)} ({change_pct:+.1f}%)"
                    fig_yearly.add_annotation(
                        text=annotation_text,
                        xref="paper", yref="paper",
                        x=0.5, y=1.05,
                        showarrow=False,
                        font=dict(size=12, color='green' if change >= 0 else 'red')
                    )

                fig_yearly.update_layout(
                    xaxis_title='Year',
                    yaxis_title=f'Net Worth ({display_currency})',
                    height=400,
                    hovermode='x unified',
                    showlegend=False
                )

                st.plotly_chart(fig_yearly, use_container_width=True)
            else:
                st.info("No yearly trend data available")

        st.divider()

        col_a, col_b = st.columns(2)

        with col_a:
            st.subheader("💰 Assets")
            for acc in net_worth_data['accounts']:
                # Show converted amount and original if different currencies
                if acc['original_currency'] != display_currency:
                    st.write(f"**{acc['name']}:** {format_number(acc['balance'], display_currency)} "
                            f"_(original: {format_number(acc['original_balance'], acc['original_currency'])})_")
                else:
                    st.write(f"**{acc['name']}:** {format_number(acc['balance'], display_currency)}")

        with col_b:
            st.subheader("💳 Debts")
            if net_worth_data['debts']:
                for debt in net_worth_data['debts']:
                    # Show converted amount and original if different currencies
                    if debt['original_currency'] != display_currency:
                        st.write(f"**{debt['name']}:** {format_number(debt['balance'], display_currency)} "
                                f"_(original: {format_number(debt['original_balance'], debt['original_currency'])})_")
                    else:
                        st.write(f"**{debt['name']}:** {format_number(debt['balance'], display_currency)}")
            else:
                st.success("🎉 No debts!")
        
        # Pie chart
        st.divider()
        
        breakdown_data = []
        for acc in net_worth_data['accounts']:
            breakdown_data.append({'Type': 'Assets', 'Item': acc['name'], 'Amount': acc['balance']})
        for debt in net_worth_data['debts']:
            breakdown_data.append({'Type': 'Debts', 'Item': debt['name'], 'Amount': debt['balance']})
        
        if breakdown_data:
            breakdown_df = pd.DataFrame(breakdown_data)
            fig_nw = px.sunburst(breakdown_df, path=['Type', 'Item'], values='Amount',
                                title='Net Worth Breakdown')
            st.plotly_chart(fig_nw, use_container_width=True)

    # ===== TAB 6: TAG REPORT =====
    with tab6:
        st.subheader("🏷️ Tag Report")

        # Get all available tags
        available_tags = db.get_distinct_tags()

        if not available_tags:
            st.warning("⚠️ No tags found in your transactions. Add tags to transactions to use this report!")
        else:
            # Tag selection only (no date filters - shows all-time data)
            selected_tag = st.selectbox("Select Tag", available_tags, key="tag_report_select")

            if selected_tag:
                # Get tag report for all time (no date filters)
                tag_report = db.get_tag_report(selected_tag)

                # Show that this is all-time data
                st.info(f"📊 Showing all-time data for tag: **#{selected_tag}**")

                # Summary metrics
                st.divider()

                # Check if there are envelopes with this tag for budget comparison
                has_envelope_budget = len(tag_report.get('envelope_budget_data', [])) > 0

                if has_envelope_budget:
                    # Show envelope budget comparison
                    metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)
                    with metric_col1:
                        st.metric("📊 Total Transactions", tag_report['total_transactions'])
                    with metric_col2:
                        st.metric("🐷 Envelope Budget", format_number(tag_report.get('total_envelope_budget', 0), "€"))
                    with metric_col3:
                        st.metric("💳 Total Spent", format_number(tag_report['total_expenses'], "€"))
                    with metric_col4:
                        # Calculate percentage of budget used
                        budget = tag_report.get('total_envelope_budget', 0)
                        spent = tag_report['total_expenses']
                        if budget > 0:
                            pct_used = (spent / budget) * 100
                            remaining = budget - spent
                            if pct_used > 100:
                                st.metric("⚠️ Budget Status", f"{pct_used:.1f}% used", delta=f"{format_number(-remaining, '€')} over", delta_color="inverse")
                            elif pct_used > 80:
                                st.metric("🟡 Budget Status", f"{pct_used:.1f}% used", delta=f"{format_number(remaining, '€')} left", delta_color="normal")
                            else:
                                st.metric("✅ Budget Status", f"{pct_used:.1f}% used", delta=f"{format_number(remaining, '€')} left", delta_color="normal")
                        else:
                            st.metric("Budget Status", "No budget set")
                else:
                    # Show traditional metrics if no envelope budget
                    metric_col1, metric_col2, metric_col3, metric_col4, metric_col5 = st.columns(5)
                    with metric_col1:
                        st.metric("📊 Total Transactions", tag_report['total_transactions'])
                    with metric_col2:
                        st.metric("💵 Total Income", format_number(tag_report['total_income'], "€"))
                    with metric_col3:
                        st.metric("💳 Total Expenses", format_number(tag_report['total_expenses'], "€"))
                    with metric_col4:
                        st.metric("🐷 Envelope Allocations", format_number(tag_report.get('envelope_allocations', 0), "€"))
                    with metric_col5:
                        net_color = "normal" if tag_report['net'] >= 0 else "inverse"
                        st.metric("💰 Net", format_number(tag_report['net'], "€"), delta_color=net_color)

                st.divider()

                # Visualizations
                if tag_report['total_transactions'] > 0:
                    viz_col1, viz_col2 = st.columns(2)

                    with viz_col1:
                        st.subheader("📊 By Category")
                        if tag_report['by_category']:
                            cat_df = pd.DataFrame([
                                {'Category': k, 'Amount': abs(v)}
                                for k, v in tag_report['by_category'].items()
                            ]).sort_values('Amount', ascending=False)

                            fig_cat = px.bar(
                                cat_df,
                                x='Category',
                                y='Amount',
                                title=f'Spending by Category for #{selected_tag}',
                                labels={'Amount': 'Amount (€)'},
                                color='Amount',
                                color_continuous_scale='Blues'
                            )
                            fig_cat.update_layout(height=400, xaxis_tickangle=-45)
                            st.plotly_chart(fig_cat, use_container_width=True)
                        else:
                            st.info("No category data available")

                    with viz_col2:
                        st.subheader("🏦 By Account")
                        if tag_report['by_account']:
                            acc_df = pd.DataFrame([
                                {'Account': k, 'Amount': v}
                                for k, v in tag_report['by_account'].items()
                            ]).sort_values('Amount', ascending=False)

                            fig_acc = px.pie(
                                acc_df,
                                values='Amount',
                                names='Account',
                                title=f'Distribution by Account for #{selected_tag}',
                                color_discrete_sequence=px.colors.qualitative.Set3
                            )
                            fig_acc.update_layout(height=400)
                            st.plotly_chart(fig_acc, use_container_width=True)
                        else:
                            st.info("No account data available")

                    # Envelope budget comparison (if applicable)
                    if tag_report.get('envelope_budget_data'):
                        st.subheader("🐷 Envelope Budget vs Spending")

                        env_col1, env_col2 = st.columns(2)

                        with env_col1:
                            # Create visualization showing budget vs spending for each envelope
                            env_budget_df = pd.DataFrame(tag_report['envelope_budget_data'])

                            # Calculate spending per envelope
                            env_budget_df['spent'] = tag_report['total_expenses']  # For simplicity, show total spent
                            env_budget_df['percentage_used'] = (env_budget_df['spent'] / env_budget_df['budget'] * 100).round(1)

                            fig_env = px.bar(
                                env_budget_df,
                                x='name',
                                y=['budget', 'spent'],
                                title=f'Budget vs Spending for #{selected_tag}',
                                labels={'value': 'Amount (€)', 'name': 'Envelope', 'variable': 'Type'},
                                barmode='group',
                                color_discrete_map={'budget': 'lightgreen', 'spent': 'lightcoral'}
                            )
                            fig_env.update_layout(height=400, xaxis_tickangle=-45)
                            st.plotly_chart(fig_env, use_container_width=True)

                        with env_col2:
                            st.write("**Envelope Budget Details:**")
                            for env in tag_report['envelope_budget_data']:
                                budget = env['budget']
                                spent = tag_report['total_expenses']  # Total spent for this tag
                                pct_used = (spent / budget * 100) if budget > 0 else 0
                                remaining = budget - spent

                                st.write(f"**{env['name']}**")
                                st.write(f"Budget: {format_number(budget, '€')} | Spent: {format_number(spent, '€')}")

                                # Color-coded progress
                                if pct_used > 100:
                                    st.write(f"🔴 {pct_used:.1f}% used (Over budget by {format_number(-remaining, '€')})")
                                elif pct_used > 80:
                                    st.write(f"🟡 {pct_used:.1f}% used ({format_number(remaining, '€')} remaining)")
                                else:
                                    st.write(f"🟢 {pct_used:.1f}% used ({format_number(remaining, '€')} remaining)")

                                st.progress(min(pct_used / 100, 1.0))
                                st.write("")  # Add spacing

                    # Monthly trend
                    if tag_report['by_month']:
                        st.subheader("📈 Monthly Trend")
                        month_data = []
                        for month, values in sorted(tag_report['by_month'].items()):
                            month_data.append({
                                'Month': month,
                                'Income': values['income'],
                                'Expenses': values['expenses'],
                                'Envelopes': values.get('envelopes', 0)
                            })

                        month_df = pd.DataFrame(month_data)

                        fig_month = go.Figure()
                        fig_month.add_trace(go.Bar(
                            x=month_df['Month'],
                            y=month_df['Income'],
                            name='Income',
                            marker_color='lightgreen'
                        ))
                        fig_month.add_trace(go.Bar(
                            x=month_df['Month'],
                            y=month_df['Expenses'],
                            name='Expenses',
                            marker_color='lightcoral'
                        ))
                        fig_month.add_trace(go.Bar(
                            x=month_df['Month'],
                            y=month_df['Envelopes'],
                            name='Envelope Allocations',
                            marker_color='lightblue'
                        ))
                        fig_month.update_layout(
                            title=f'Monthly Breakdown for #{selected_tag}',
                            xaxis_title='Month',
                            yaxis_title='Amount (€)',
                            barmode='group',
                            height=400
                        )
                        st.plotly_chart(fig_month, use_container_width=True)

                    # Transaction list
                    st.divider()
                    st.subheader("📋 Transactions")
                    if tag_report['transactions']:
                        # Create DataFrame for display
                        trans_display = []
                        for t in tag_report['transactions'][:50]:  # Show first 50
                            trans_display.append({
                                'Date': t['transaction_date'],
                                'Description': t['description'] or '-',
                                'Category': t['type_name'],
                                'Account': t['account_name'],
                                'Amount': format_number(t['amount'], t['currency']),
                                'Tags': t['tags']
                            })

                        trans_df = pd.DataFrame(trans_display)
                        st.dataframe(trans_df, use_container_width=True, hide_index=True)

                        if len(tag_report['transactions']) > 50:
                            st.info(f"Showing first 50 of {len(tag_report['transactions'])} transactions")
                    else:
                        st.info("No transactions found for this tag and date range")

                else:
                    st.info("No transactions found for this tag and date range")

# ==================== WORK HOURS CALCULATOR ====================
elif page == "Work Hours Calculator":
    st.title("⏰ Work Hours Calculator")

    st.info("💡 See how many work hours your expenses cost you. Set up your work profile and calculate the real cost of any purchase in working time.")

    tab1, tab2 = st.tabs(["🧮 Calculator", "⚙️ Work Profiles"])

    with tab1:
        st.subheader("Calculate Work Hours")

        # Get all work profiles
        work_profiles = db.get_all_work_profiles()

        if not work_profiles:
            st.warning("⚠️ No work profiles configured yet! Set up your profile in the 'Work Profiles' tab first.")
        else:
            # Select owner
            profile_options = {profile['owner_name']: profile for profile in work_profiles}
            selected_owner_name = st.selectbox(
                "Select Owner",
                list(profile_options.keys()),
                help="Choose whose work profile to use for calculation"
            )

            selected_profile = profile_options[selected_owner_name]

            # Display profile info
            col_info1, col_info2, col_info3 = st.columns(3)

            with col_info1:
                st.metric("Monthly Salary (Net)", format_number(selected_profile['monthly_salary'], selected_profile['currency']))

            with col_info2:
                st.metric("Working Hours/Month", f"{selected_profile['working_hours_per_month']:.0f}h")

            with col_info3:
                st.metric("Hourly Rate (Net)", format_number(selected_profile['hourly_rate'], selected_profile['currency']))

            st.divider()

            # Calculator
            st.markdown("### 💰 Calculate Cost in Work Hours")

            col_calc1, col_calc2 = st.columns(2)

            with col_calc1:
                amount_str = st.text_input(
                    f"Amount ({selected_profile['currency']})",
                    placeholder="1 500,00",
                    help="Enter any amount to see how many work hours it represents",
                    key="work_hours_amount"
                )

            with col_calc2:
                # Optional: Show some quick reference amounts
                st.write("**Quick examples:**")
                quick_amounts = [100, 500, 1000, 5000]
                for amt in quick_amounts:
                    work_hours = amt / selected_profile['hourly_rate']
                    st.caption(f"{format_number(amt, selected_profile['currency'])} = {work_hours:.1f}h")

            if amount_str:
                try:
                    amount = parse_amount(amount_str)

                    if amount <= 0:
                        st.error("Amount must be greater than 0!")
                    else:
                        # Calculate work hours
                        work_hours = amount / selected_profile['hourly_rate']
                        work_days = work_hours / 8  # Assuming 8-hour workday
                        work_weeks = work_days / 5  # Assuming 5-day workweek

                        # Display results
                        st.success("### 📊 Results")

                        col_res1, col_res2, col_res3 = st.columns(3)

                        with col_res1:
                            st.metric("Work Hours", f"{work_hours:.1f}h")

                        with col_res2:
                            st.metric("Work Days", f"{work_days:.1f} days")

                        with col_res3:
                            st.metric("Work Weeks", f"{work_weeks:.2f} weeks")

                        # Visual representation
                        st.markdown("---")
                        st.markdown(f"### 💡 Perspective")

                        # Create perspective messages
                        if work_hours < 1:
                            minutes = work_hours * 60
                            st.info(f"**{format_number(amount, selected_profile['currency'])}** costs you **{minutes:.0f} minutes** of work")
                        elif work_hours < 8:
                            st.info(f"**{format_number(amount, selected_profile['currency'])}** costs you **{work_hours:.1f} hours** of work - That's **{(work_hours/8)*100:.0f}% of a workday**")
                        elif work_days < 5:
                            st.info(f"**{format_number(amount, selected_profile['currency'])}** costs you **{work_days:.1f} workdays** - Almost **{work_weeks:.1f} weeks** of work")
                        elif work_weeks < 4:
                            st.warning(f"**{format_number(amount, selected_profile['currency'])}** costs you **{work_weeks:.1f} weeks** of work!")
                        else:
                            months = work_weeks / 4
                            st.error(f"**{format_number(amount, selected_profile['currency'])}** costs you **{months:.1f} months** of work! 😱")

                        # Additional context
                        st.markdown("---")
                        col_ctx1, col_ctx2 = st.columns(2)

                        with col_ctx1:
                            st.markdown("**🔢 Breakdown:**")
                            st.write(f"- Amount: {format_number(amount, selected_profile['currency'])}")
                            st.write(f"- Your hourly rate: {format_number(selected_profile['hourly_rate'], selected_profile['currency'])}/h")
                            st.write(f"- Calculation: {amount:.2f} ÷ {selected_profile['hourly_rate']:.2f} = {work_hours:.1f}h")

                        with col_ctx2:
                            st.markdown("**⏰ Time equivalents:**")
                            if work_hours >= 1:
                                st.write(f"- {work_hours:.1f} hours")
                            if work_hours >= 0.1:
                                st.write(f"- {work_hours * 60:.0f} minutes")
                            if work_days >= 0.1:
                                st.write(f"- {work_days:.2f} workdays (8h each)")
                            if work_weeks >= 0.1:
                                st.write(f"- {work_weeks:.2f} workweeks (40h each)")

                except ValueError:
                    st.error("Invalid amount format! Use format like: 1 500,00 or 1500")

    with tab2:
        st.subheader("⚙️ Manage Work Profiles")

        st.info("💡 Set up work profiles for each owner to calculate how purchases translate to work hours. Use your **net salary** (after taxes).")

        # Get owners and existing profiles
        owners = db.get_owners()
        existing_profiles = db.get_all_work_profiles()
        existing_profile_owners = {p['owner_id']: p for p in existing_profiles}

        # Display existing profiles
        if existing_profiles:
            st.markdown("### 📋 Existing Profiles")

            for profile in existing_profiles:
                with st.expander(f"👤 {profile['owner_name']}", expanded=False):
                    col_p1, col_p2, col_p3, col_p4 = st.columns(4)

                    with col_p1:
                        st.write(f"**Monthly Salary (Net):**")
                        st.write(format_number(profile['monthly_salary'], profile['currency']))

                    with col_p2:
                        st.write(f"**Working Hours/Month:**")
                        st.write(f"{profile['working_hours_per_month']:.0f}h")

                    with col_p3:
                        st.write(f"**Hourly Rate (Net):**")
                        st.write(format_number(profile['hourly_rate'], profile['currency']))

                    with col_p4:
                        if st.button("🗑️ Delete", key=f"del_profile_{profile['owner_id']}"):
                            if db.delete_work_profile(profile['owner_id']):
                                st.success("Profile deleted!")
                                st.rerun()
                            else:
                                st.error("Failed to delete profile")

        st.divider()

        # Add/Update profile form
        st.markdown("### ➕ Add or Update Profile")

        with st.form("work_profile_form"):
            # Select owner
            owner_options = {o['name']: o['id'] for o in owners}
            selected_owner = st.selectbox("Owner", list(owner_options.keys()))
            owner_id = owner_options[selected_owner]

            # Check if profile exists
            existing_profile = existing_profile_owners.get(owner_id)

            col_form1, col_form2 = st.columns(2)

            with col_form1:
                monthly_salary_str = st.text_input(
                    "Monthly Net Salary (after taxes)",
                    value=str(existing_profile['monthly_salary']) if existing_profile else "",
                    placeholder="3 500,00",
                    help="Your take-home pay after all taxes and deductions"
                )

                currency_options = ["EUR", "DKK", "SEK", "USD", "GBP", "CHF"]
                currency_idx = currency_options.index(existing_profile['currency']) if existing_profile and existing_profile['currency'] in currency_options else 0
                currency = st.selectbox("Currency", currency_options, index=currency_idx)

            with col_form2:
                working_hours_str = st.text_input(
                    "Working Hours per Month",
                    value=str(existing_profile['working_hours_per_month']) if existing_profile else "",
                    placeholder="160",
                    help="Total hours you work in a month (e.g., 40h/week × 4 weeks = 160h)"
                )

                st.caption("💡 Standard: 40h/week × 4.33 weeks = ~173h/month")

            submit_label = "💾 Update Profile" if existing_profile else "➕ Create Profile"

            if st.form_submit_button(submit_label, use_container_width=True):
                if not monthly_salary_str or not working_hours_str:
                    st.error("Please fill in all fields!")
                else:
                    try:
                        monthly_salary = parse_amount(monthly_salary_str)
                        working_hours = parse_amount(working_hours_str)

                        if monthly_salary <= 0:
                            st.error("Monthly salary must be greater than 0!")
                        elif working_hours <= 0:
                            st.error("Working hours must be greater than 0!")
                        else:
                            profile_data = {
                                'owner_id': owner_id,
                                'monthly_salary': monthly_salary,
                                'working_hours_per_month': working_hours,
                                'currency': currency
                            }

                            db.add_or_update_work_profile(profile_data)

                            hourly_rate = monthly_salary / working_hours

                            action = "updated" if existing_profile else "created"
                            st.success(f"✅ Profile {action}! Hourly rate: {format_number(hourly_rate, currency)}/h")
                            st.balloons()
                            st.rerun()

                    except ValueError:
                        st.error("Invalid number format! Use format like: 3 500,00 or 3500")

# ==================== INVESTMENTS ====================
elif page == "Investments":
    st.title("📈 Investment Portfolio")
    
    st.info("💡 Track stocks, ETFs, mutual funds, bonds, and crypto. Prices update automatically from Yahoo Finance.")
    
    tab1, tab2, tab3, tab4 = st.tabs(["📊 Portfolio", "💼 Holdings", "📝 Transactions", "⚙️ Manage"])
    
    # ===== TAB 1: PORTFOLIO OVERVIEW =====
    with tab1:
        st.subheader("📊 Portfolio Overview")
        
        # Account filter
        accounts = db.get_accounts()
        investment_accounts = [a for a in accounts if a['account_type'] == 'investment']
        
        if not investment_accounts:
            st.warning("⚠️ No investment accounts found. Create one in 'Manage Accounts'.")
        else:
            account_options = ["All Accounts"] + [a['name'] for a in investment_accounts]
            selected_account = st.selectbox("Account", account_options)
            
            account_id = None
            if selected_account != "All Accounts":
                account_id = next(a['id'] for a in investment_accounts if a['name'] == selected_account)
            
            # Update prices button
            col_a, col_b = st.columns([3, 1])
            with col_b:
                if st.button("🔄 Update Prices"):
                    with st.spinner("Updating prices from Yahoo Finance..."):
                        updated = db.update_all_prices_from_yahoo()
                        st.success(f"✅ Updated {updated} holding(s)")
                        st.rerun()
            
            # Show linked account info if single account selected
            if account_id:
                accounts = db.get_accounts()
                selected_acc = next((a for a in accounts if a['id'] == account_id), None)
                if selected_acc and selected_acc.get('linked_account_id'):
                    linked_acc = next((a for a in accounts if a['id'] == selected_acc['linked_account_id']), None)
                    if linked_acc:
                        st.info(f"💼 Cash movements for this investment account flow through: **{linked_acc['name']}** ({linked_acc['currency']})")

            # Get portfolio summary
            portfolio = db.get_portfolio_summary(account_id)

            if portfolio['holdings_count'] == 0:
                st.info("No holdings yet. Add holdings in the 'Manage' tab.")
            else:
                # Main metrics - All values in Euros
                col1, col2, col3, col4 = st.columns(4)

                with col1:
                    st.metric("💰 Total Value", format_number(portfolio['total_value'], "€"))
                with col2:
                    gain_color = "normal" if portfolio['total_gains'] >= 0 else "inverse"
                    st.metric("📈 Total Gains", format_number(portfolio['total_gains'], "€"),
                             delta=f"{portfolio['total_return_pct']:.2f}%", delta_color=gain_color)
                with col3:
                    st.metric("💵 Dividends", format_number(portfolio['total_dividends'], "€"))
                with col4:
                    st.metric("📊 Holdings", portfolio['holdings_count'])
                
                st.divider()
                
                # Asset allocation
                col_x, col_y = st.columns([2, 1])
                
                with col_x:
                    if portfolio['asset_allocation']:
                        alloc_df = pd.DataFrame([
                            {'Type': k.replace('_', ' ').title(), 'Value': v}
                            for k, v in portfolio['asset_allocation'].items()
                        ])
                        
                        fig_alloc = px.pie(alloc_df, values='Value', names='Type',
                                          title='Asset Allocation',
                                          hole=0.4)
                        st.plotly_chart(fig_alloc, use_container_width=True)
                
                with col_y:
                    st.write("**Performance Summary:**")
                    st.write(f"**Cost Basis:** {format_number(portfolio['total_cost'], '€')}")
                    st.write(f"**Current Value:** {format_number(portfolio['total_value'], '€')}")
                    st.write(f"**Unrealized Gains:** {format_number(portfolio['total_unrealized_gains'], '€')}")
                    st.write(f"**Realized Gains:** {format_number(portfolio['total_realized_gains'], '€')}")
                    st.write(f"**Total Return:** {portfolio['total_return_pct']:.2f}%")
                
                st.divider()
                
                # Top holdings
                st.subheader("Top Holdings")
                
                holdings_sorted = sorted(portfolio['holdings'], key=lambda x: x['current_value'], reverse=True)
                
                for holding in holdings_sorted[:10]:
                    with st.container():
                        col1, col2, col3, col4 = st.columns([2, 2, 2, 1])

                        with col1:
                            st.write(f"**{holding['symbol']}**")
                            st.caption(holding['name'])
                            # Show ISIN if available
                            if holding.get('isin'):
                                st.caption(f"ISIN: {holding['isin']}")

                        with col2:
                            st.write(f"{holding['total_shares']:.2f} shares @ {format_number(holding['current_price'], '€')}")
                            st.caption(f"Avg cost: {format_number(holding['avg_cost_per_share'], '€')}")

                        with col3:
                            st.write(f"Value: {format_number(holding['current_value'], '€')}")
                            gain_pct = ((holding['current_price'] / holding['avg_cost_per_share']) - 1) * 100 if holding['avg_cost_per_share'] > 0 else 0
                            gain_color = "🟢" if holding['unrealized_gains'] >= 0 else "🔴"
                            st.caption(f"{gain_color} {format_number(holding['unrealized_gains'], '€')} ({gain_pct:.2f}%)")

                        with col4:
                            pct_of_portfolio = (holding['current_value'] / portfolio['total_value'] * 100) if portfolio['total_value'] > 0 else 0
                            st.metric("Portfolio %", f"{pct_of_portfolio:.1f}%", label_visibility="hidden")

                        st.divider()
    
    # ===== TAB 2: HOLDINGS DETAIL =====
    with tab2:
        st.subheader("💼 Holdings Detail")
        
        holdings = db.get_investment_holdings()
        
        if not holdings:
            st.info("No holdings yet.")
        else:
            for holding in holdings:
                summary = db.calculate_holding_summary(holding['id'])

                # Use € symbol for Euro formatting
                with st.expander(f"{summary['symbol']} - {summary['name']} ({format_number(summary['current_value'], '€')})"):
                    # Show ISIN if available
                    if summary.get('isin'):
                        st.caption(f"📋 ISIN: {summary['isin']}")

                    col1, col2, col3 = st.columns(3)

                    with col1:
                        st.write("**Position:**")
                        st.write(f"Shares: {summary['total_shares']:.4f}")
                        st.write(f"Avg Cost: {format_number(summary['avg_cost_per_share'], '€')}")
                        st.write(f"Current Price: {format_number(summary['current_price'], '€')}")
                        st.write(f"Total Cost: {format_number(summary['total_cost'], '€')}")

                    with col2:
                        st.write("**Performance:**")
                        st.write(f"Current Value: {format_number(summary['current_value'], '€')}")
                        st.write(f"Unrealized Gains: {format_number(summary['unrealized_gains'], '€')}")
                        st.write(f"Realized Gains: {format_number(summary['realized_gains'], '€')}")
                        st.write(f"Total Return: {summary['total_return_pct']:.2f}%")

                    with col3:
                        st.write("**Dividends:**")
                        st.write(f"Total Dividends: {format_number(summary['total_dividends'], '€')}")
                        st.write(f"Dividend Yield: {summary['dividend_yield']:.2f}%")
                        st.write(f"")
                        if summary['last_price_update']:
                            st.caption(f"Price updated: {summary['last_price_update']}")
                    
                    # Show transactions
                    if st.checkbox(f"Show transactions for {summary['symbol']}", key=f"trans_{holding['id']}"):
                        transactions = db.get_investment_transactions(holding['id'])
                        
                        if transactions:
                            for trans in transactions:
                                col_a, col_b, col_c, col_d = st.columns(4)
                                with col_a:
                                    trans_type_icon = "📈" if trans['transaction_type'] == 'buy' else "📉" if trans['transaction_type'] == 'sell' else "💵"
                                    st.write(f"{trans_type_icon} {trans['transaction_type'].title()}")
                                with col_b:
                                    st.write(trans['transaction_date'])
                                with col_c:
                                    if trans['shares']:
                                        st.write(f"{trans['shares']} @ {format_number(trans['price_per_share'], '€')}")
                                with col_d:
                                    st.write(format_number(trans['total_amount'], '€'))
    
    # ===== TAB 3: TRANSACTIONS =====
    with tab3:
        st.subheader("📝 Add Investment Transaction")
        
        holdings = db.get_investment_holdings()
        
        if not holdings:
            st.warning("Create a holding first in the 'Manage' tab!")
        else:
            col1, col2 = st.columns(2)
            
            with col1:
                holding_options = [f"{h['symbol']} - {h['name']}" for h in holdings]
                selected_holding_opt = st.selectbox("Holding", holding_options)
                selected_holding = holdings[holding_options.index(selected_holding_opt)]
                
                trans_type = st.selectbox("Transaction Type", ["buy", "sell", "dividend"])
                trans_date = st.date_input("Date", date.today())
            
            with col2:
                if trans_type in ["buy", "sell"]:
                    shares = st.text_input("Number of Shares", placeholder="12.035951", help="Enter precise share quantity (e.g., 12.035951)")
                    price_per_share = st.text_input("Price per Share", placeholder="150.25")
                    fees = st.text_input("Fees (Optional)", placeholder="0.00")
                else:  # dividend
                    shares = None
                    price_per_share = None
                    dividend_amount = st.text_input("Dividend Amount", placeholder="50.00")
                    fees = None
                
                notes = st.text_area("Notes (Optional)", placeholder="Additional information")
            
            if st.button("💾 Record Transaction", use_container_width=True):
                try:
                    if trans_type in ["buy", "sell"]:
                        if not shares or not price_per_share:
                            st.error("Shares and price are required!")
                        else:
                            try:
                                shares_float = parse_amount(shares)
                            except ValueError:
                                st.error(f"❌ Invalid shares format: '{shares}'. Please use numbers only (e.g., 10 or 10.5)")
                                st.stop()

                            try:
                                price_float = parse_amount(price_per_share)
                            except ValueError:
                                st.error(f"❌ Invalid price format: '{price_per_share}'. Please use numbers only (e.g., 150.25)")
                                st.stop()

                            try:
                                fees_float = parse_amount(fees) if fees else 0
                            except ValueError:
                                st.error(f"❌ Invalid fees format: '{fees}'. Please use numbers only (e.g., 5.00)")
                                st.stop()

                            total = shares_float * price_float

                            trans_data = {
                                'holding_id': selected_holding['id'],
                                'transaction_type': trans_type,
                                'transaction_date': trans_date.isoformat(),
                                'shares': shares_float,
                                'price_per_share': price_float,
                                'total_amount': total,
                                'fees': fees_float,
                                'currency': selected_holding['currency'],
                                'notes': notes
                            }

                            try:
                                trans_id = db.add_investment_transaction(trans_data)
                                st.success(f"✅ {trans_type.title()} transaction recorded!")
                                st.rerun()
                            except Exception as e:
                                st.error(f"❌ Database error: {str(e)}")
                                import traceback
                                st.code(traceback.format_exc())
                    else:  # dividend
                        if not dividend_amount:
                            st.error("Dividend amount is required!")
                        else:
                            try:
                                div_float = parse_amount(dividend_amount)
                            except ValueError:
                                st.error(f"❌ Invalid dividend amount format: '{dividend_amount}'. Please use numbers only (e.g., 50.00)")
                                st.stop()

                            trans_data = {
                                'holding_id': selected_holding['id'],
                                'transaction_type': 'dividend',
                                'transaction_date': trans_date.isoformat(),
                                'total_amount': div_float,
                                'currency': selected_holding['currency'],
                                'notes': notes
                            }

                            try:
                                trans_id = db.add_investment_transaction(trans_data)
                                st.success(f"✅ Dividend recorded!")
                                st.rerun()
                            except Exception as e:
                                st.error(f"❌ Database error: {str(e)}")
                                import traceback
                                st.code(traceback.format_exc())
                except Exception as e:
                    st.error(f"❌ Unexpected error: {str(e)}")
    
    # ===== TAB 4: MANAGE HOLDINGS =====
    with tab4:
        st.subheader("⚙️ Manage Holdings")
        
        holdings = db.get_investment_holdings()
        
        if holdings:
            st.write("**Existing Holdings:**")
            for holding in holdings:
                col1, col2, col3 = st.columns([3, 2, 1])
                with col1:
                    st.write(f"**{holding['symbol']}** - {holding['name']}")
                    if holding.get('isin'):
                        st.caption(f"ISIN: {holding['isin']}")
                with col2:
                    st.write(f"{holding['investment_type'].replace('_', ' ').title()} ({holding['currency']})")
                with col3:
                    col_verify, col_edit, col_del = st.columns(3)
                    with col_verify:
                        if st.button("🔍", key=f"verify_holding_{holding['id']}", help="Verify data from Yahoo Finance"):
                            st.session_state[f"verifying_holding_{holding['id']}"] = True
                            st.rerun()
                    with col_edit:
                        if st.button("✏️", key=f"edit_holding_{holding['id']}", help="Edit this holding"):
                            st.session_state[f"editing_holding_{holding['id']}"] = True
                            st.rerun()
                    with col_del:
                        if st.button("🗑️", key=f"del_holding_{holding['id']}", help="Delete this holding"):
                            # Use session state to track confirmation
                            if f"confirm_delete_{holding['id']}" not in st.session_state:
                                st.session_state[f"confirm_delete_{holding['id']}"] = True
                                st.warning(f"⚠️ Click delete again to confirm removal of {holding['symbol']}")
                                st.rerun()
                            else:
                                # Confirmed - delete the holding
                                success = db.delete_investment_holding(holding['id'])
                                if success:
                                    st.success(f"✅ Deleted {holding['symbol']}")
                                    # Clear confirmation state
                                    del st.session_state[f"confirm_delete_{holding['id']}"]
                                    st.rerun()
                                else:
                                    st.error("Failed to delete holding")
                                    del st.session_state[f"confirm_delete_{holding['id']}"]

                # Verify form - shows what data yfinance returns for this symbol
                if st.session_state.get(f"verifying_holding_{holding['id']}", False):
                    st.divider()
                    with st.container():
                        st.write(f"**🔍 Verifying Data for: {holding['symbol']}**")

                        col_v1, col_v2 = st.columns(2)

                        with col_v1:
                            st.write("**Stored Information:**")
                            st.write(f"- Symbol: `{holding['symbol']}`")
                            st.write(f"- ISIN: `{holding.get('isin', 'N/A')}`")
                            st.write(f"- Name: {holding['name']}")
                            st.write(f"- Type: {holding['investment_type'].replace('_', ' ').title()}")
                            st.write(f"- Currency: {holding['currency']}")
                            st.write(f"- Stored Price: {holding.get('current_price', 0):.2f}")

                            # Add ISIN lookup test button
                            if holding.get('isin'):
                                st.divider()
                                st.write("**🔬 Test ISIN Lookup:**")
                                if st.button("🧪 Lookup ISIN on OpenFIGI", key=f"test_isin_{holding['id']}"):
                                    try:
                                        from isin_lookup import ISINLookup, ISINLookupError

                                        with st.spinner(f"Querying OpenFIGI for {holding['isin']}..."):
                                            result = ISINLookup.lookup_from_openfigi(holding['isin'])

                                            st.success("✅ OpenFIGI Response:")
                                            st.json({
                                                'Symbol returned': result['symbol'],
                                                'Name': result['name'],
                                                'Exchange code': result['exchange'],
                                                'Market sector': result['market_sector'],
                                                'Investment type': result['investment_type']
                                            })

                                            # Show raw ticker from OpenFIGI
                                            if 'raw_data' in result:
                                                raw_ticker = result['raw_data'].get('ticker', 'N/A')
                                                st.info(f"📌 Raw ticker from OpenFIGI: `{raw_ticker}`")
                                                st.info(f"📌 Symbol built with suffix: `{result['symbol']}`")

                                    except ISINLookupError as e:
                                        st.error(f"❌ {str(e)}")
                                    except Exception as e:
                                        st.error(f"Error: {str(e)}")

                        with col_v2:
                            with st.spinner(f"Fetching live data for {holding['symbol']}..."):
                                try:
                                    import yfinance as yf
                                    ticker = yf.Ticker(holding['symbol'])
                                    info = ticker.info

                                    st.write("**Live Yahoo Finance Data:**")
                                    live_name = info.get('longName', info.get('shortName', 'N/A'))
                                    live_currency = info.get('currency', 'N/A')

                                    st.write(f"- Long Name: {info.get('longName', 'N/A')}")
                                    st.write(f"- Short Name: {info.get('shortName', 'N/A')}")
                                    st.write(f"- Currency: {live_currency}")
                                    st.write(f"- Exchange: {info.get('exchange', 'N/A')}")

                                    # Detect mismatch
                                    name_mismatch = False
                                    currency_mismatch = False

                                    # Smarter name matching - check for significant word overlap
                                    if live_name != 'N/A':
                                        # Remove common suffixes and normalize
                                        stored_name_clean = holding['name'].upper().replace('UCITS ETF', '').replace('ETF', '').replace('ACC', '').replace('DIS', '').replace('DIST', '').strip()
                                        live_name_clean = live_name.upper().replace('UCITS ETF', '').replace('ETF', '').replace('ACC', '').replace('DIS', '').replace('DIST', '').replace(' - ', ' ').strip()

                                        # Get significant words (3+ chars) from both names
                                        stored_words = set(word for word in stored_name_clean.split() if len(word) >= 3)
                                        live_words = set(word for word in live_name_clean.split() if len(word) >= 3)

                                        # Calculate word overlap
                                        common_words = stored_words.intersection(live_words)

                                        # If less than 50% overlap, consider it a mismatch
                                        if stored_words and live_words:
                                            overlap_ratio = len(common_words) / min(len(stored_words), len(live_words))
                                            if overlap_ratio < 0.5:
                                                name_mismatch = True
                                        else:
                                            # Fallback to substring check
                                            if holding['name'].upper() not in live_name.upper() and live_name.upper() not in holding['name'].upper():
                                                name_mismatch = True

                                    # Currency mismatch - only flag if significantly different
                                    if live_currency != 'N/A' and live_currency != holding['currency']:
                                        currency_mismatch = True

                                    # Show all available price fields
                                    st.write("**Available Price Fields:**")
                                    price_fields = {
                                        'currentPrice': info.get('currentPrice'),
                                        'regularMarketPrice': info.get('regularMarketPrice'),
                                        'previousClose': info.get('previousClose'),
                                        'navPrice': info.get('navPrice')
                                    }

                                    for field, value in price_fields.items():
                                        if value:
                                            st.write(f"- {field}: **{value:.2f}** ✅")
                                        else:
                                            st.write(f"- {field}: N/A ❌")

                                    # Show which price would be used
                                    selected_price = (
                                        info.get('currentPrice') or
                                        info.get('regularMarketPrice') or
                                        info.get('previousClose') or
                                        info.get('navPrice')
                                    )

                                    if selected_price:
                                        st.success(f"✅ Price to use: **{selected_price:.2f}** {live_currency}")
                                    else:
                                        st.error("❌ No valid price available!")

                                except Exception as e:
                                    st.error(f"❌ Error fetching data: {str(e)}")
                                    st.info("💡 This might indicate an incorrect symbol. Try using ISIN lookup to get the correct symbol.")
                                    name_mismatch = True
                                    currency_mismatch = True

                        # Show warning if mismatch detected (only for significant mismatches)
                        if name_mismatch or currency_mismatch:
                            st.error("⚠️ **MISMATCH DETECTED!** The symbol does not match the stored data.")
                            if name_mismatch:
                                st.warning(f"📛 **Significant name mismatch detected:**")
                                st.write(f"- Symbol `{holding['symbol']}` returns: `{live_name}`")
                                st.write(f"- You have stored: `{holding['name']}`")
                                st.caption("⚠️ These appear to be different securities. Verify this is correct!")
                            if currency_mismatch:
                                st.warning(f"💱 **Currency mismatch:** Symbol returns **{live_currency}** but you have **{holding['currency']}** stored.")

                            # Offer ISIN re-lookup if ISIN is available
                            if holding.get('isin'):
                                st.info(f"💡 You have ISIN `{holding['isin']}` stored. Click below to fetch the correct symbol from this ISIN.")

                                if st.button("🔄 Re-fetch Correct Symbol from ISIN", key=f"refetch_isin_{holding['id']}", type="primary"):
                                    try:
                                        from isin_lookup import ISINLookup, ISINLookupError

                                        with st.spinner(f"Looking up correct symbol for ISIN {holding['isin']}..."):
                                            result = ISINLookup.lookup_complete(holding['isin'], fetch_price=True)

                                            # Update the holding with correct data
                                            update_data = {
                                                'symbol': result['symbol'],
                                                'name': result['name'],
                                                'investment_type': result['investment_type'],
                                                'currency': result.get('currency', 'EUR'),
                                                'isin': holding['isin']
                                            }

                                            if db.update_investment_holding(holding['id'], update_data):
                                                # Also update the price if available
                                                if result.get('current_price'):
                                                    db.update_holding_price(holding['id'], result['current_price'])

                                                st.success(f"✅ Updated! Correct symbol is **{result['symbol']}** - {result['name']}")
                                                st.info(f"💰 Price: {result.get('current_price', 'N/A')} {result.get('currency', 'EUR')}")
                                                st.session_state[f"verifying_holding_{holding['id']}"] = False
                                                st.rerun()
                                            else:
                                                st.error("Failed to update holding")

                                    except ISINLookupError as e:
                                        st.error(f"❌ ISIN Lookup Failed: {str(e)}")
                                    except Exception as e:
                                        st.error(f"Unexpected error: {str(e)}")
                        else:
                            # No mismatch - data looks good!
                            st.success("✅ **Verification Passed!** Symbol and data match correctly.")
                            st.info("💡 The stored symbol matches the security data from Yahoo Finance.")

                        col_close, col_space = st.columns([1, 3])
                        with col_close:
                            if st.button("Close", key=f"close_verify_{holding['id']}", use_container_width=True):
                                st.session_state[f"verifying_holding_{holding['id']}"] = False
                                st.rerun()

                    st.divider()

                # Edit form
                if st.session_state.get(f"editing_holding_{holding['id']}", False):
                    st.divider()
                    with st.form(f"edit_holding_form_{holding['id']}"):
                        st.write(f"**Editing: {holding['symbol']}**")

                        col_e1, col_e2 = st.columns(2)

                        with col_e1:
                            edit_symbol = st.text_input("Symbol/Ticker", value=holding['symbol'])
                            edit_name = st.text_input("Name", value=holding['name'])
                            edit_isin = st.text_input("ISIN", value=holding.get('isin', '') or '')

                        with col_e2:
                            inv_type_options = ["stock", "etf", "mutual_fund", "bond", "crypto"]
                            current_type_idx = inv_type_options.index(holding['investment_type']) if holding['investment_type'] in inv_type_options else 0
                            edit_inv_type = st.selectbox("Investment Type",
                                inv_type_options,
                                index=current_type_idx,
                                format_func=lambda x: x.replace('_', ' ').title()
                            )

                            currency_options = ["EUR", "USD", "DKK", "SEK", "GBP", "CHF"]
                            current_currency_idx = currency_options.index(holding['currency']) if holding['currency'] in currency_options else 0
                            edit_currency = st.selectbox("Currency", currency_options, index=current_currency_idx)

                        col_save, col_cancel = st.columns(2)
                        with col_save:
                            if st.form_submit_button("💾 Save", use_container_width=True):
                                # Validate ISIN if provided
                                cleaned_isin = None
                                if edit_isin and len(edit_isin.strip()) > 0:
                                    try:
                                        from isin_lookup import ISINLookup
                                        cleaned_isin = edit_isin.strip().upper()
                                        if not ISINLookup.validate_isin(cleaned_isin):
                                            st.error("❌ Invalid ISIN format")
                                            st.stop()
                                    except ImportError:
                                        cleaned_isin = edit_isin.strip().upper()

                                update_data = {
                                    'symbol': edit_symbol.strip().upper(),
                                    'name': edit_name.strip(),
                                    'investment_type': edit_inv_type,
                                    'currency': edit_currency,
                                    'isin': cleaned_isin
                                }

                                if db.update_investment_holding(holding['id'], update_data):
                                    st.session_state[f"editing_holding_{holding['id']}"] = False
                                    st.success("✅ Holding updated!")
                                    st.rerun()
                                else:
                                    st.error("Failed to update holding")

                        with col_cancel:
                            if st.form_submit_button("❌ Cancel", use_container_width=True):
                                st.session_state[f"editing_holding_{holding['id']}"] = False
                                st.rerun()

                st.divider()

            st.divider()
        
        st.write("**Add New Holding:**")
        
        # Get investment accounts
        accounts = db.get_accounts()
        inv_accounts = [a for a in accounts if a['account_type'] == 'investment']
        
        if not inv_accounts:
            st.warning("Create an investment account first in 'Manage Accounts'!")
        else:
            col1, col2 = st.columns(2)

            with col1:
                inv_account_options = [a['name'] for a in inv_accounts]
                selected_inv_account = st.selectbox("Account", inv_account_options)

                # ISIN is now the primary input field (moved to top)
                isin = st.text_input("ISIN", placeholder="IE00BK5BQT80",
                                    help="International Securities Identification Number - 12 character code (e.g., IE00BK5BQT80 for VWCE)")

                # Auto-fill button for ISIN lookup (prominent placement)
                if isin and st.button("🔍 Auto-fill from ISIN", use_container_width=True, type="primary"):
                    # Import the lookup utility
                    try:
                        from isin_lookup import ISINLookup, ISINLookupError

                        with st.spinner(f"Looking up ISIN {isin.strip().upper()}..."):
                            try:
                                # Perform lookup (fetch_price=True to get current price as well)
                                result = ISINLookup.lookup_complete(isin, fetch_price=True)

                                # Store fetched data in session state to populate fields
                                st.session_state['isin_symbol'] = result['symbol']
                                st.session_state['isin_name'] = result['name']
                                st.session_state['isin_type'] = result['investment_type']
                                st.session_state['isin_currency'] = result.get('currency', 'EUR')
                                st.session_state['isin_price'] = result.get('current_price')

                                # Show success message with details
                                st.success(f"✅ Found: **{result['name']}** ({result['symbol']})")
                                if result.get('current_price'):
                                    st.info(f"Current Price: {result['current_price']:.2f} {result.get('currency', 'EUR')}")
                                st.rerun()

                            except ISINLookupError as e:
                                st.error(f"❌ ISIN Lookup Failed: {str(e)}")
                                st.info("💡 Tip: Double-check the ISIN format or enter details manually below.")
                            except Exception as e:
                                st.error(f"Unexpected error: {str(e)}")
                                st.info("Please enter details manually.")
                    except ImportError:
                        st.error("ISIN lookup module not found. Please enter details manually.")

                # Symbol field (populated from ISIN lookup or manual entry)
                symbol = st.text_input("Symbol/Ticker",
                                      placeholder="VWCE.DE, AAPL",
                                      value=st.session_state.get('isin_symbol', ''),
                                      help="Stock ticker symbol with exchange suffix (e.g., VWCE.DE for XETRA)")

                # Name field (populated from ISIN lookup or manual entry)
                name = st.text_input("Name",
                                    placeholder="Vanguard FTSE All-World UCITS ETF",
                                    value=st.session_state.get('isin_name', ''),
                                    help="Full security name")

            with col2:
                # Investment type (populated from ISIN lookup or manual selection)
                inv_type_options = ["stock", "etf", "mutual_fund", "bond", "crypto"]
                default_type_idx = 0
                if 'isin_type' in st.session_state and st.session_state['isin_type'] in inv_type_options:
                    default_type_idx = inv_type_options.index(st.session_state['isin_type'])

                inv_type = st.selectbox("Investment Type",
                    inv_type_options,
                    index=default_type_idx,
                    format_func=lambda x: x.replace('_', ' ').title(),
                    help="Select the type of security"
                )

                # Currency selection (populated from ISIN lookup or manual selection)
                currency_options = ["EUR", "USD", "DKK", "SEK", "GBP", "CHF"]
                default_currency = st.session_state.get('isin_currency', 'EUR')
                if default_currency not in currency_options:
                    currency_options.append(default_currency)
                default_currency_idx = currency_options.index(default_currency)

                currency = st.selectbox("Currency",
                                       currency_options,
                                       index=default_currency_idx)

                # Legacy auto-fetch from Yahoo (keep as fallback if user enters symbol directly)
                if symbol and not isin and st.button("🔍 Auto-fill from Symbol"):
                    try:
                        import yfinance as yf
                        ticker = yf.Ticker(symbol)
                        info = ticker.info

                        if 'longName' in info:
                            st.session_state['isin_name'] = info['longName']
                            st.success(f"Found: {info['longName']}")
                            st.rerun()
                    except:
                        st.error("Could not fetch data from symbol. Try using ISIN or enter manually.")

            if st.button("➕ Add Holding", use_container_width=True):
                # Validation
                if not symbol or not name:
                    st.error("Symbol and name are required!")
                else:
                    # Validate ISIN format if provided (should be 12 alphanumeric characters)
                    cleaned_isin = None
                    if isin and len(isin.strip()) > 0:
                        from isin_lookup import ISINLookup

                        cleaned_isin = isin.strip().upper()
                        if not ISINLookup.validate_isin(cleaned_isin):
                            st.error("❌ Invalid ISIN format. Must be 12 alphanumeric characters starting with 2-letter country code (e.g., IE00BK5BQT80)")
                            st.stop()

                    account_id = next(a['id'] for a in inv_accounts if a['name'] == selected_inv_account)

                    # Get current price from session state if available (from ISIN lookup)
                    current_price = st.session_state.get('isin_price', 0)

                    holding_data = {
                        'account_id': account_id,
                        'symbol': symbol.strip().upper(),
                        'name': name.strip(),
                        'investment_type': inv_type,
                        'currency': currency,
                        'isin': cleaned_isin,
                        'current_price': current_price if current_price else 0
                    }

                    holding_id = db.add_investment_holding(holding_data)

                    # Clear ISIN lookup session state after successful add
                    for key in ['isin_symbol', 'isin_name', 'isin_type', 'isin_currency', 'isin_price']:
                        if key in st.session_state:
                            del st.session_state[key]

                    # Success message
                    success_msg = f"✅ Holding {symbol.strip().upper()} added!"
                    if cleaned_isin:
                        success_msg += f" (ISIN: {cleaned_isin})"
                    if current_price:
                        success_msg += f" - Price: {current_price:.2f} {currency}"

                    st.success(success_msg)
                    st.rerun()

# ==================== BACKUP ====================
elif page == "Backup":
    st.title("💾 Backup & Restore")

    tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "Create Backup", "Restore", "Backup History", "Cloud Sync", "Settings"
    ])

    with tab1:
        st.markdown("### 📦 Create New Backup")

        description = st.text_input(
            "Backup Description (optional)",
            placeholder="e.g., Before major update"
        )

        if st.button("🔒 Create Manual Backup", type="primary"):
            with st.spinner("Creating backup..."):
                result = backup_mgr.create_backup('manual', description)

            if result:
                st.success(f"""
                ✅ Backup Created Successfully!
                - **File:** {result['filename']}
                - **Size:** {result['size_bytes'] / 1024:.2f} KB
                - **Transactions:** {result['stats'].get('transactions', 0)}
                - **Accounts:** {result['stats'].get('accounts', 0)}
                - **Checksum:** {result['checksum'][:16]}...
                """)
            else:
                st.error("❌ Backup failed")

        # Quick export
        st.markdown("### 📤 Export Backup")
        backups = backup_mgr.list_backups(10)
        if backups:
            backup_options = {
                f"{b['id']} - {b['timestamp'][:19]} ({b['type']})": b['id']
                for b in backups
            }
            selected = st.selectbox("Select backup to export", list(backup_options.keys()))
            backup_id = backup_options[selected]

            # Get backup file for download
            backup = next(b for b in backups if b['id'] == backup_id)
            backup_path = Path(backup['path'])

            if backup_path.exists():
                with open(backup_path, 'rb') as f:
                    st.download_button(
                        "⬇️ Download Backup",
                        f.read(),
                        file_name=backup_path.name,
                        mime="application/octet-stream"
                    )

    with tab2:
        st.markdown("### 🔄 Restore from Backup")

        st.warning("""
        ⚠️ **Warning:** Restoring a backup will replace your current database.
        A pre-restore backup will be automatically created before restoration.
        """)

        backups = backup_mgr.list_backups(20)

        if not backups:
            st.info("No backups available")
        else:
            # Display backups in a table
            backup_data = []
            for b in backups:
                backup_data.append({
                    'ID': b['id'],
                    'Date': b['timestamp'][:19],
                    'Type': b['type'],
                    'Size': f"{b['size_bytes'] / 1024:.1f} KB",
                    'Transactions': b['stats'].get('transactions', '?'),
                    'Description': b.get('description', '')[:30]
                })

            df = pd.DataFrame(backup_data)
            st.dataframe(df, use_container_width=True)

            # Restore selection
            backup_id_to_restore = st.number_input(
                "Enter Backup ID to Restore",
                min_value=1,
                max_value=max(b['id'] for b in backups),
                step=1
            )

            # Confirmation
            confirm = st.checkbox("I understand this will replace my current database")

            if st.button("🔄 Restore Backup", type="primary", disabled=not confirm):
                try:
                    with st.spinner("Restoring backup..."):
                        success = backup_mgr.restore_backup(backup_id_to_restore)

                    if success:
                        # Clear cached database and auth manager to reload with restored data
                        st.cache_resource.clear()

                        st.success("""
                        ✅ Backup restored successfully!

                        **Important:** Please refresh the page to reload the database.
                        """)
                        st.button("🔄 Refresh Page", on_click=st.rerun)
                    else:
                        st.error("❌ Restore failed")

                except Exception as e:
                    st.error(f"❌ Error during restore: {str(e)}")

        # Import external backup
        st.markdown("---")
        st.markdown("### 📥 Import External Backup")

        uploaded_backup = st.file_uploader(
            "Upload backup file",
            type=['db'],
            help="Upload a .db backup file"
        )

        if uploaded_backup:
            # Save uploaded file temporarily
            temp_path = Path("data/temp_import_backup")
            temp_path.parent.mkdir(exist_ok=True)

            with open(temp_path, 'wb') as f:
                f.write(uploaded_backup.getbuffer())

            if st.button("📥 Import Backup"):
                try:
                    result = backup_mgr.import_backup(str(temp_path))
                    st.success(f"✅ Backup imported: {result['filename']}")
                    temp_path.unlink()
                except Exception as e:
                    st.error(f"❌ Import failed: {str(e)}")

    with tab3:
        st.markdown("### 📜 Backup History")

        timeline = backup_mgr.get_backup_timeline()

        if timeline:
            # Create timeline visualization
            for entry in reversed(timeline[-20:]):  # Last 20 entries
                with st.container():
                    col1, col2 = st.columns([1, 3])

                with col1:
                    st.write(f"**#{entry['id']}**")
                    st.write(entry['timestamp'][:10])

                with col2:
                    st.write(f"Type: {entry['type']}")
                    if entry['changes']:
                        changes_str = ", ".join([
                            f"{k}: {'+' if v > 0 else ''}{v}"
                            for k, v in entry['changes'].items()
                        ])
                        st.write(f"Changes: {changes_str}")
                    else:
                        st.write("No changes from previous")

            st.markdown("---")

            # Compare two backups
        st.markdown("### 🔍 Compare Backups")

        if len(backups) >= 2:
            col1, col2 = st.columns(2)

            with col1:
                old_id = st.selectbox(
                "Older Backup",
                [b['id'] for b in backups],
                index=min(1, len(backups)-1)
            )

            with col2:
                new_id = st.selectbox(
                "Newer Backup",
                [b['id'] for b in backups],
                index=0
            )

        if st.button("Compare"):
            try:
                comparison = backup_mgr.compare_backups(old_id, new_id)

                st.markdown(f"""
                **Comparing Backup #{old_id} to #{new_id}**

                Period: {comparison['old_backup']['timestamp'][:19]} → {comparison['new_backup']['timestamp'][:19]}
                """)

                if comparison['changes']:
                    for key, change in comparison['changes'].items():
                        delta = change['diff']
                        icon = "📈" if delta > 0 else "📉" if delta < 0 else "➡️"
                        st.write(f"{icon} **{key}:** {change['old']} → {change['new']} ({'+' if delta > 0 else ''}{delta})")
                else:
                    st.info("No changes between backups")

            except Exception as e:
                st.error(f"Comparison failed: {str(e)}")

        # Statistics
        stats = backup_mgr.get_backup_statistics()

        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total Backups", stats['total_backups'])
        with col2:
            st.metric("Storage Used", f"{stats.get('total_size_mb', 0)} MB")
        with col3:
            if stats['newest_backup']:
                st.metric("Latest Backup", stats['newest_backup'][:10])

        st.markdown("---")

        # Full backup list
        backups = backup_mgr.list_backups(50)

        for backup in backups:
            with st.expander(
                f"#{backup['id']} - {backup['timestamp'][:19]} ({backup['type']})"
            ):
                col1, col2 = st.columns(2)
                with col1:
                    st.write(f"**File:** {backup['filename']}")
                    st.write(f"**Size:** {backup['size_bytes'] / 1024:.2f} KB")
                    st.write(f"**Compressed:** {'Yes' if backup['compressed'] else 'No'}")

                with col2:
                    st.write(f"**Transactions:** {backup['stats'].get('transactions', '?')}")
                    st.write(f"**Accounts:** {backup['stats'].get('accounts', '?')}")
                    st.write(f"**Checksum:** {backup['checksum'][:32]}...")

                if backup.get('description'):
                    st.write(f"**Description:** {backup['description']}")

                # Delete button (only for manual backups)
                if backup['type'] == 'manual':
                    if st.button(f"🗑️ Delete", key=f"del_{backup['id']}"):
                        backup_mgr.delete_backup(backup['id'])
                        st.success("Backup deleted")
                        st.rerun()

    with tab4:
        st.markdown("### ☁️ Cloud Storage Integration")

        # Provider selection
        provider = st.selectbox(
            "Storage Provider",
            ["Local/Network Drive", "WebDAV (Nextcloud/ownCloud)", "Manual Export"]
        )

        if provider == "Local/Network Drive":
            cloud_path = st.text_input(
                "Network/External Drive Path",
                placeholder="/mnt/nas/backups or D:\\Backups"
            )

            if cloud_path and st.button("🔗 Connect"):
                from cloud_backup import LocalCloudAdapter, CloudBackupManager
                adapter = LocalCloudAdapter(cloud_path)
                cloud_mgr = CloudBackupManager(adapter)
                st.session_state.cloud_mgr = cloud_mgr
                st.success(f"✅ Connected to {cloud_path}")

        elif provider == "WebDAV (Nextcloud/ownCloud)":
            webdav_url = st.text_input("WebDAV URL", placeholder="https://cloud.example.com/remote.php/dav/files/username/")
            webdav_user = st.text_input("Username")
            webdav_pass = st.text_input("Password", type="password")
            webdav_path = st.text_input("Base Path", value="/Backups/FinanceTracker")

            if webdav_url and webdav_user and webdav_pass:
                if st.button("🔗 Connect"):
                    try:
                        from cloud_backup import WebDAVAdapter, CloudBackupManager
                        adapter = WebDAVAdapter(webdav_url, webdav_user, webdav_pass, webdav_path)
                        cloud_mgr = CloudBackupManager(adapter)
                        st.session_state.cloud_mgr = cloud_mgr
                        st.success("✅ Connected to WebDAV")
                    except Exception as e:
                        st.error(f"❌ Connection failed: {str(e)}")

        # Cloud operations (if connected)
        if 'cloud_mgr' in st.session_state:
            st.markdown("---")
            cloud_mgr = st.session_state.cloud_mgr

            col1, col2 = st.columns(2)

            with col1:
                st.markdown("#### Upload to Cloud")
                backups = backup_mgr.list_backups(10)
                if backups:
                    backup_to_sync = st.selectbox(
                        "Select backup",
                        [f"{b['id']} - {b['filename']}" for b in backups]
                    )
                    backup_id = int(backup_to_sync.split(" - ")[0])
                    backup = next(b for b in backups if b['id'] == backup_id)

                    if st.button("☁️ Upload to Cloud"):
                        success = cloud_mgr.sync_backup(backup['path'])
                        if success:
                            st.success("✅ Backup uploaded to cloud")
                        else:
                            st.error("❌ Upload failed")

                if st.button("🔄 Sync All Backups"):
                    results = cloud_mgr.sync_all_backups("data/backups")
                    st.success(f"""
                    Sync complete:
                    - Uploaded: {results['uploaded']}
                    - Skipped: {results['skipped']}
                    - Failed: {results['failed']}
                    """)

            with col2:
                st.markdown("#### Download from Cloud")
                cloud_backups = cloud_mgr.list_cloud_backups()
                if cloud_backups:
                    selected_cloud = st.selectbox("Cloud backups", cloud_backups)
                    if st.button("⬇️ Download"):
                        local_dest = f"data/backups/cloud_{Path(selected_cloud).name}"
                        success = cloud_mgr.download_backup(
                            Path(selected_cloud).name, local_dest
                        )
                        if success:
                            st.success(f"✅ Downloaded to {local_dest}")
                        else:
                            st.error("❌ Download failed")
                else:
                    st.info("No backups found in cloud")

        else:
            st.info("Configure and connect to a storage provider above")

    with tab5:
        st.markdown("### ⚙️ Backup Settings")

        settings = backup_mgr.metadata['settings']

        auto_enabled = st.toggle(
            "Enable Automatic Backups",
            value=settings['auto_backup_enabled']
        )

        retention = st.slider(
            "Retention Period (days)",
            min_value=7,
            max_value=365,
            value=settings['retention_days'],
            help="Auto backups older than this will be deleted"
        )

        max_backups = st.number_input(
            "Maximum Backups to Keep",
            min_value=10,
            max_value=500,
            value=settings['max_backups']
        )

        compress = st.toggle(
            "Compress Backups (saves space)",
            value=settings['compress_backups']
        )

        if st.button("💾 Save Settings"):
            backup_mgr.update_settings(
                auto_enabled, retention, max_backups, compress
            )
            st.success("✅ Settings saved")

        # Manual cleanup
        st.markdown("---")
        st.markdown("### 🧹 Manual Cleanup")

        if st.button("Clean Up Old Backups"):
            backup_mgr._cleanup_old_backups()
            st.success("✅ Old backups cleaned up")
            st.rerun()

# ==================== SETTINGS ====================
elif page == "Settings":
    st.title("⚙️ Settings")

    show_user_settings(auth_mgr)
    st.markdown("---")

    # User Management (Admin Only)
    if st.session_state.get('user_role') == 'admin':
        st.subheader("👥 User Management")
        st.info("💡 Only administrators can create and manage users.")

        tab1, tab2 = st.tabs(["📋 Users List", "➕ Create User"])

        with tab1:
            st.write("**All Users:**")
            users = auth_mgr.list_users()

            if users:
                for user in users:
                    with st.expander(f"{'🔑' if user['role'] == 'admin' else '👤'} {user['username']} ({user['email']})", expanded=False):
                        col1, col2, col3 = st.columns([2, 2, 1])

                        with col1:
                            st.write(f"**Role:** {user['role'].title()}")
                            st.write(f"**Email:** {user['email']}")
                            st.write(f"**Active:** {'✅ Yes' if user['is_active'] else '❌ No'}")

                        with col2:
                            if user['last_login']:
                                st.write(f"**Last Login:** {user['last_login']}")
                            else:
                                st.write("**Last Login:** Never")
                            st.write(f"**Created:** {user['created_at']}")
                            if user.get('failed_login_attempts', 0) > 0:
                                st.write(f"**Failed Attempts:** {user['failed_login_attempts']}")

                        with col3:
                            # Don't allow admin to delete themselves
                            if user['id'] != st.session_state.get('user_id'):
                                if st.button(f"Reset Password", key=f"reset_pwd_{user['id']}", use_container_width=True):
                                    st.session_state[f"resetting_password_{user['id']}"] = True
                                    st.rerun()

                                if user['is_active']:
                                    if st.button(f"🔒 Disable", key=f"disable_{user['id']}", use_container_width=True):
                                        auth_mgr._get_connection().execute("UPDATE users SET is_active = 0 WHERE id = ?", (user['id'],))
                                        auth_mgr._get_connection().commit()
                                        auth_mgr._get_connection().close()
                                        st.success(f"User {user['username']} disabled")
                                        st.rerun()
                                else:
                                    if st.button(f"✅ Enable", key=f"enable_{user['id']}", use_container_width=True):
                                        auth_mgr._get_connection().execute("UPDATE users SET is_active = 1 WHERE id = ?", (user['id'],))
                                        auth_mgr._get_connection().commit()
                                        auth_mgr._get_connection().close()
                                        st.success(f"User {user['username']} enabled")
                                        st.rerun()

                        # Password reset form
                        if st.session_state.get(f"resetting_password_{user['id']}", False):
                            st.divider()
                            st.markdown("**Reset Password**")
                            with st.form(f"reset_password_form_{user['id']}"):
                                st.warning(f"Resetting password for **{user['username']}**")
                                st.info("User will be required to change this password on next login.")

                                new_temp_password = st.text_input(
                                    "Temporary Password",
                                    type="password",
                                    help="At least 8 characters",
                                    key=f"temp_pwd_{user['id']}"
                                )

                                col_reset, col_cancel = st.columns(2)
                                with col_reset:
                                    if st.form_submit_button("Reset Password", use_container_width=True, type="primary"):
                                        if len(new_temp_password) >= 8:
                                            # Update password and set requires_password_change flag
                                            success, msg = auth_mgr.update_user_password(user['id'], new_temp_password, clear_password_change_requirement=False)
                                            if success:
                                                # Set requires_password_change flag
                                                conn = auth_mgr._get_connection()
                                                conn.execute("UPDATE users SET requires_password_change = 1 WHERE id = ?", (user['id'],))
                                                conn.commit()
                                                conn.close()
                                                st.success(f"✅ Password reset for {user['username']}. User must change it on next login.")
                                                st.session_state[f"resetting_password_{user['id']}"] = False
                                                st.rerun()
                                            else:
                                                st.error(msg)
                                        else:
                                            st.error("Password must be at least 8 characters")

                                with col_cancel:
                                    if st.form_submit_button("Cancel", use_container_width=True):
                                        st.session_state[f"resetting_password_{user['id']}"] = False
                                        st.rerun()
            else:
                st.info("No users found")

        with tab2:
            st.write("**Create New User:**")
            st.info("New users will be required to change their password on first login.")

            with st.form("create_user_form"):
                col_user1, col_user2 = st.columns(2)

                with col_user1:
                    new_username = st.text_input(
                        "Username",
                        help="At least 3 characters, lowercase"
                    )
                    new_user_email = st.text_input(
                        "Email",
                        help="User's email address"
                    )

                with col_user2:
                    new_user_role = st.selectbox(
                        "Role",
                        ["user", "admin"],
                        help="Admin users can manage other users"
                    )
                    new_temp_pwd = st.text_input(
                        "Temporary Password",
                        type="password",
                        help="At least 8 characters - user will be required to change this on first login"
                    )

                if st.form_submit_button("➕ Create User", use_container_width=True, type="primary"):
                    if not all([new_username, new_user_email, new_temp_pwd]):
                        st.error("Please fill in all fields")
                    else:
                        success, message = auth_mgr.create_user(
                            username=new_username,
                            email=new_user_email,
                            password=new_temp_pwd,
                            role=new_user_role,
                            requires_password_change=True
                        )

                        if success:
                            st.success(f"✅ User **{new_username}** created successfully! They must change their password on first login.")
                            st.rerun()
                        else:
                            st.error(message)

        st.markdown("---")

    st.subheader("Database Info")
    st.info(f"📁 Database location: `{db.db_path}`")

    st.divider()

    # Currency Settings
    st.markdown("### 💱 Currency & Exchange Rate Settings")

    col_curr1, col_curr2 = st.columns(2)

    with col_curr1:
        # Dashboard display currency
        current_dashboard_currency = db.get_preference('dashboard_currency', 'DKK')
        available_currencies = ["DKK", "EUR", "SEK", "USD", "GBP", "CHF"]

        dashboard_currency_idx = available_currencies.index(current_dashboard_currency) if current_dashboard_currency in available_currencies else 0

        selected_dashboard_currency = st.selectbox(
            "Dashboard Display Currency",
            available_currencies,
            index=dashboard_currency_idx,
            help="All amounts on the dashboard will be converted to this currency"
        )

        if st.button("💾 Save Dashboard Currency"):
            db.set_preference('dashboard_currency', selected_dashboard_currency)
            st.success(f"✅ Dashboard currency set to {selected_dashboard_currency}")
            st.rerun()

    with col_curr2:
        st.info("💡 Exchange rates are used to convert account balances to your dashboard currency. Rates are relative to EUR = 1.0")

    # Exchange Rate Configuration
    with st.expander("⚙️ Configure Exchange Rates"):
        st.caption("Configure exchange rates relative to EUR (EUR = 1.0)")

        import json
        rates_json = db.get_preference('exchange_rates', '{}')
        try:
            stored_rates = json.loads(rates_json)
        except:
            stored_rates = {}

        # Default rates
        default_rates = {
            'EUR': 1.0,
            'DKK': 7.45,
            'SEK': 11.50,
            'USD': 1.10,
            'GBP': 0.85,
            'CHF': 0.95
        }

        # Merge with stored rates
        current_rates = {**default_rates, **stored_rates}

        st.write("**Exchange Rates (1 EUR = X units)**")

        col_rate1, col_rate2, col_rate3 = st.columns(3)

        new_rates = {}
        currencies_to_configure = ["EUR", "DKK", "SEK", "USD", "GBP", "CHF"]

        for idx, currency in enumerate(currencies_to_configure):
            col = [col_rate1, col_rate2, col_rate3][idx % 3]
            with col:
                new_rates[currency] = st.number_input(
                    f"{currency}",
                    value=float(current_rates.get(currency, 1.0)),
                    format="%.4f",
                    step=0.01,
                    disabled=(currency == "EUR"),  # EUR is always 1.0
                    key=f"rate_{currency}"
                )

        col_save_rates, col_reset_rates = st.columns(2)

        with col_save_rates:
            if st.button("💾 Save Exchange Rates", use_container_width=True):
                db.set_preference('exchange_rates', json.dumps(new_rates))
                st.success("✅ Exchange rates saved!")
                st.rerun()

        with col_reset_rates:
            if st.button("🔄 Reset to Defaults", use_container_width=True):
                db.set_preference('exchange_rates', '{}')
                st.success("✅ Exchange rates reset to defaults!")
                st.rerun()

    st.divider()

    # Auto-Categorization Model
    st.markdown("### 🤖 Auto-Categorization Model")

    categorizer = TransactionCategorizer()

    model_info = categorizer.get_model_info()

    if model_info['trained']:
        st.success(f"✅ Model trained with {model_info['n_classes']} categories")
    else:
        st.warning("Model not yet trained")

    if st.button("🎓 Train Model"):
        training_data = db.get_training_data()
        if len(training_data) >= 10:
            try:
                n_samples, n_classes = categorizer.train_model(training_data)
                st.success(f"✅ Model trained on {n_samples} samples with {n_classes} classes")
            except Exception as e:
                st.error(f"Training failed: {str(e)}")
        else:
            st.error("Not enough transactions to train model (need at least 10)")

    # Statistics
    transactions = db.get_transactions()
    accounts = db.get_accounts()
    types = db.get_types()
    
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Total Transactions", len(transactions))
    with col2:
        st.metric("Total Accounts", len(accounts))
    with col3:
        st.metric("Transaction Types", len(types))
    
    st.divider()
    
    st.subheader("Export All Data")
    if st.button("📥 Export Complete Database"):
        json_data = db.export_to_json()
        st.download_button(
            label="Download Complete Export",
            data=json_data,
            file_name=f"finance_complete_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            mime="application/json"
        )
    
    st.divider()

    # Maintenance Section
    st.markdown("### 🔧 Maintenance")

    with st.expander("⚠️ Recalculate Account Balances", expanded=False):
        st.warning("**Use this tool if account balances appear incorrect**")
        st.write("""
        This utility will recalculate all account balances from scratch based on your confirmed transactions.

        **When to use this:**
        - Account balances don't match your transactions
        - After importing data
        - After fixing transaction errors

        **What it does:**
        - Resets all account balances to 0
        - Processes all confirmed transactions in chronological order
        - Updates balances for income, expenses, and transfers

        ⚠️ **Note:** Pending/unconfirmed transactions are not included in balance calculations.
        """)

        if st.button("🔄 Recalculate All Balances", type="primary", use_container_width=True):
            with st.spinner("Recalculating balances..."):
                try:
                    result = db.recalculate_all_balances()
                    st.success(f"""
                    ✅ **Balance recalculation complete!**

                    - **Accounts updated:** {result['accounts_updated']}
                    - **Transactions processed:** {result['transactions_processed']}
                    """)
                    st.balloons()
                    st.info("💡 Refresh the page or navigate to Dashboard to see updated balances")
                except Exception as e:
                    st.error(f"❌ Recalculation failed: {str(e)}")
                    import traceback
                    st.code(traceback.format_exc())

    st.divider()

    # Alerts
    st.markdown("### 🔔 Alert Settings")

    with st.expander("Email Configuration"):
        col1, col2 = st.columns(2)
    with col1:
        smtp_server = st.text_input(
                    "SMTP Server",
            value=alert_manager.config['email'].get('smtp_server', ''),
            help="e.g., smtp.gmail.com"
        )
        smtp_port = st.number_input(
            "SMTP Port",
            value=alert_manager.config['email'].get('smtp_port', 587)
        )
        from_email = st.text_input(
            "From Email",
            value=alert_manager.config['email'].get('from_email', '')
        )

    with col2:
        username = st.text_input(
            "Username",
            value=alert_manager.config['email'].get('username', '')
            )
        password = st.text_input(
            "Password",
            type="password"
        )
        to_email = st.text_input(
            "Alert Email",
            value=alert_manager.config['email'].get('to_email', '')
        )

    if st.button("💾 Save Email Settings"):
        alert_manager.update_email_settings(
            smtp_server, smtp_port, username, password, from_email, to_email
        )
        st.success("✅ Email settings saved")

    if st.button("📧 Test Email"):
        success = alert_manager.send_email(
            "Test Alert",
            "This is a test notification from Finance Tracker."
        )
        if success:
            st.success("✅ Test email sent")
        else:
            st.error("❌ Failed to send test email")

    with st.expander("Alert Thresholds"):
        daily_limit = st.number_input(
            "Daily Spending Alert (€)",
            value=float(alert_manager.config['thresholds'].get('daily_spending', 0)),
            help="0 = disabled"
        )
        budget_pct = st.slider(
            "Budget Warning Threshold (%)",
            50, 100,
            value=alert_manager.config['thresholds'].get('budget_percentage', 90)
        )
        anomaly_detect = st.checkbox(
            "Enable Anomaly Detection",
            value=alert_manager.config['thresholds'].get('anomaly_detection', True)
        )

        if st.button("💾 Save Thresholds"):
            alert_manager.update_thresholds(daily_limit, budget_pct, anomaly_detect)
            st.success("✅ Thresholds saved")

        # Display alert history
        st.markdown("### 📜 Recent Alerts")
        alert_history = alert_manager.get_alert_history()
        if alert_history:
            for alert in alert_history[:10]:
                st.write(f"**{alert['timestamp'][:19]}** - {alert['type']}: {alert['message']} ({alert['status']})")
        else:
            st.info("No alerts yet")

    st.subheader("About")
    st.write("""
    **Finance Tracker v1.3**
    
    A comprehensive personal finance management application.
    
    **Phase 1 Features:**
    - Track income, expenses, and transfers
    - Multiple accounts and owners
    - Custom categories with visual colors
    - Export capabilities
    - Number formatting: 20 000,89
    
    **Phase 2 Features (NEW!):**
    - 🐷 Envelopes - Savings goal tracking
    - 💳 Debt tracking (coming soon)
    - 🔄 Recurring transactions (coming soon)
    
    Phase 2A.1: Envelopes ✅ COMPLETE
    """)

# Sidebar info
st.sidebar.divider()
st.sidebar.caption("💰 Finance Tracker v1.3")
st.sidebar.caption("Phase 2B.1")