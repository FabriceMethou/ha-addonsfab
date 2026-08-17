import 'package:flutter/material.dart';

import '../accounts/accounts_screen.dart';
import '../budgets/budgets_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../transactions/transactions_screen.dart';

/// The four destinations, behind one bottom bar.
///
/// Built on an IndexedStack rather than swapping widgets, so each screen keeps
/// its scroll position and its loaded data while you move between them. On a
/// read-only app that is most of the value: switching tabs should feel like
/// looking away and back, not like reloading.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          BudgetsScreen(),
          DashboardScreen(),
          TransactionsScreen(),
          AccountsScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.donut_small_outlined),
            selectedIcon: Icon(Icons.donut_small),
            label: 'Budgets',
          ),
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            selectedIcon: Icon(Icons.insights),
            label: 'Overview',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Activity',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_outlined),
            selectedIcon: Icon(Icons.account_balance),
            label: 'Accounts',
          ),
        ],
      ),
    );
  }
}
