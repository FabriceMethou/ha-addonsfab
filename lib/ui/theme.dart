import 'package:flutter/material.dart';

import '../domain/budget_pace.dart';

/// Colours taken from the website, so a category that reads as trouble in the
/// browser reads the same on the phone.
///
/// The website is dark-only, so its exact values work there but not on a light
/// background. The light variants below are darkened until they carry enough
/// contrast against white while staying recognisably the same hue.
abstract final class AppColors {
  /// `#3b82f6` in `tailwind.config.cjs`.
  static const primary = Color(0xFF3B82F6);

  /// Under budget. `success` on the website.
  static const healthy = Color(0xFF10B981);
  static const healthyOnLight = Color(0xFF047857);

  /// Approaching the limit. `warning` on the website.
  static const close = Color(0xFFF59E0B);
  static const closeOnLight = Color(0xFFB45309);

  /// At or past the limit. `error` on the website.
  static const over = Color(0xFFEF4444);
  static const overOnLight = Color(0xFFB91C1C);

  /// The website's page background.
  static const darkBackground = Color(0xFF040617);
  static const darkSurface = Color(0xFF0F172A);
}

/// The colour for a budget severity, picked for the current brightness.
Color colorForLevel(BudgetLevel level, Brightness brightness) {
  final light = brightness == Brightness.light;
  return switch (level) {
    BudgetLevel.healthy => light ? AppColors.healthyOnLight : AppColors.healthy,
    BudgetLevel.close => light ? AppColors.closeOnLight : AppColors.close,
    BudgetLevel.over => light ? AppColors.overOnLight : AppColors.over,
  };
}

ThemeData buildLightTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.primary,
    brightness: Brightness.light,
  ).copyWith(error: AppColors.overOnLight);
  return _base(scheme);
}

ThemeData buildDarkTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.primary,
    brightness: Brightness.dark,
  ).copyWith(
    surface: AppColors.darkBackground,
    surfaceContainer: AppColors.darkSurface,
    error: AppColors.over,
  );
  return _base(scheme);
}

ThemeData _base(ColorScheme scheme) => ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
        filled: true,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.5)),
        ),
      ),
      // Digits in a budget list have to line up, or the eye cannot compare them.
      textTheme: const TextTheme().apply(fontFamilyFallback: const ['monospace']),
    );
