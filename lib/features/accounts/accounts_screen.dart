import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/money.dart';
import '../../core/net/api_exception.dart';
import '../../core/providers.dart';
import '../../domain/models/account.dart';
import '../../ui/views.dart';

/// Balances by owner, plus the accounts behind each figure.
///
/// Both calls are needed: the summary carries totals the server converted into
/// one currency, while the account list carries each balance in its own. Only
/// the former can be added up.
typedef AccountsData = ({BalancesSummary balances, List<Account> accounts});

final accountsProvider = FutureProvider<AccountsData>((ref) async {
  final api = ref.watch(financeApiProvider);
  if (api == null) {
    throw const ApiException(ApiFailure.unknown, 'No server configured.');
  }
  final results = await Future.wait([api.balances(), api.accounts()]);
  return (
    balances: results[0] as BalancesSummary,
    accounts: results[1] as List<Account>,
  );
});

class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(accountsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Accounts'),
        actions: const [OpenOnWebsiteButton(path: '/accounts')],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(accountsProvider.future),
        child: data.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => FailureView(
            error: e,
            onRetry: () => ref.invalidate(accountsProvider),
          ),
          data: (d) => _AccountsList(data: d),
        ),
      ),
    );
  }
}

class _AccountsList extends StatelessWidget {
  const _AccountsList({required this.data});
  final AccountsData data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final owners = data.balances.owners;

    if (owners.isEmpty) {
      return const EmptyView(
        icon: Icons.account_balance_outlined,
        title: 'No accounts yet.',
        detail: 'Accounts are created on the website.',
      );
    }

    // Owners with no accounts are filtered out by BalancesSummary.owners: they
    // exist in the database but would be a row that never says anything.
    final byOwner = <int, List<Account>>{};
    for (final account in data.accounts) {
      (byOwner[account.ownerId ?? -1] ??= []).add(account);
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _HouseholdTotal(summary: data.balances),
        const Divider(height: 32),
        for (final owner in owners) ...[
          _OwnerHeader(owner: owner, currency: data.balances.currency),
          for (final account in _sorted(byOwner[owner.ownerId] ?? const []))
            _AccountTile(account: account),
          const SizedBox(height: 20),
        ],
        Text(
          // Said plainly, because the two sets of figures on this screen are
          // in different currencies and the difference is not obvious.
          'Owner totals are converted to ${data.balances.currency}. '
          'Each account shows its own currency.',
          style: theme.textTheme.labelSmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }

  /// Groups an owner's accounts by bank, then by name, so the same account
  /// keeps the same place between visits.
  List<Account> _sorted(List<Account> accounts) {
    final sorted = [...accounts];
    sorted.sort((a, b) {
      final bank = (a.bankName ?? '~').compareTo(b.bankName ?? '~');
      return bank != 0 ? bank : a.name.compareTo(b.name);
    });
    return sorted;
  }
}

class _HouseholdTotal extends StatelessWidget {
  const _HouseholdTotal({required this.summary});
  final BalancesSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ALL ACCOUNTS',
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            letterSpacing: 1.1,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          formatMoney(summary.total, summary.currency),
          style: theme.textTheme.headlineMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

class _OwnerHeader extends StatelessWidget {
  const _OwnerHeader({required this.owner, required this.currency});
  final OwnerBalance owner;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              owner.ownerName,
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          Text(
            formatMoney(owner.totalBalance, currency),
            style: theme.textTheme.titleMedium,
          ),
        ],
      ),
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({required this.account});
  final Account account;

  static const _icons = {
    'cash': Icons.payments_outlined,
    'checking': Icons.account_balance_outlined,
    'savings': Icons.savings_outlined,
    'investment': Icons.trending_up,
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final negative = account.balance < 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Icon(
            _icons[account.accountType] ?? Icons.account_balance_wallet_outlined,
            size: 20,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  account.name,
                  style: theme.textTheme.bodyLarge,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  [
                    account.bankName ?? 'No bank',
                    account.accountType,
                  ].join(' · '),
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            // In the account's own currency, never converted: adding these up
            // is exactly the mistake the owner totals above exist to avoid.
            formatMoney(account.balance, account.currency),
            style: theme.textTheme.bodyLarge?.copyWith(
              fontWeight: FontWeight.w600,
              color: negative ? theme.colorScheme.error : null,
            ),
          ),
        ],
      ),
    );
  }
}
