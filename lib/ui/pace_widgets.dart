import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../domain/budget_pace.dart';
import 'theme.dart';

/// The budget ring: spend as an arc, the month as a tick.
///
/// Drawn to the same proportions as the native home-screen widget so the two
/// read as the same object. The tick is what makes either of them worth
/// looking at — an arc at 68% means nothing until you know whether the month
/// is 20% or 90% gone.
class BudgetRing extends StatelessWidget {
  const BudgetRing({
    super.key,
    required this.spent,
    required this.pace,
    required this.level,
    required this.label,
    this.caption,
    this.size = 132,
  });

  /// Share of the limit used. May exceed 1; the arc fills, the label does not lie.
  final double spent;

  /// Share of the month elapsed.
  final double pace;

  final BudgetLevel level;
  final String label;
  final String? caption;
  final double size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RingPainter(
          spent: spent,
          pace: pace,
          arcColor: colorForLevel(level, theme.brightness),
          trackColor: theme.colorScheme.surfaceContainerHighest,
          tickColor: theme.colorScheme.onSurface,
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
              ),
              if (caption != null)
                Text(
                  caption!,
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({
    required this.spent,
    required this.pace,
    required this.arcColor,
    required this.trackColor,
    required this.tickColor,
  });

  final double spent;
  final double pace;
  final Color arcColor;
  final Color trackColor;
  final Color tickColor;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.12;
    final rect = Rect.fromLTWH(0, 0, size.width, size.height)
        .deflate(stroke / 2);

    canvas.drawArc(
      rect,
      0,
      math.pi * 2,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..color = trackColor,
    );

    // From twelve o'clock, clockwise: the direction a filling gauge is read.
    final sweep = spent.clamp(0.0, 1.0) * math.pi * 2;
    if (sweep > 0) {
      canvas.drawArc(
        rect,
        -math.pi / 2,
        sweep,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round
          ..color = arcColor,
      );
    }

    final angle = pace.clamp(0.0, 1.0) * math.pi * 2 - math.pi / 2;
    final centre = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - stroke / 2;
    final inner = radius - stroke / 2 - size.width * 0.02;
    final outer = radius + stroke / 2 + size.width * 0.02;
    canvas.drawLine(
      centre + Offset(math.cos(angle) * inner, math.sin(angle) * inner),
      centre + Offset(math.cos(angle) * outer, math.sin(angle) * outer),
      Paint()
        ..strokeWidth = size.width * 0.028
        ..strokeCap = StrokeCap.round
        ..color = tickColor,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.spent != spent ||
      old.pace != pace ||
      old.arcColor != arcColor ||
      old.trackColor != trackColor ||
      old.tickColor != tickColor;
}

/// A progress bar carrying a second mark for how much of the month has gone.
class PacedBar extends StatelessWidget {
  const PacedBar({
    super.key,
    required this.fraction,
    required this.pace,
    required this.level,
    this.height = 8,
  });

  final double fraction;
  final double pace;
  final BudgetLevel level;
  final double height;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = colorForLevel(level, theme.brightness);

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        return SizedBox(
          height: height + 6,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned(
                top: 3,
                left: 0,
                right: 0,
                child: Container(
                  height: height,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(height / 2),
                  ),
                ),
              ),
              Positioned(
                top: 3,
                left: 0,
                // Clamped so a 340% category does not draw off the end, while
                // the percentage beside it keeps the real number.
                width: width * fraction.clamp(0.0, 1.0),
                child: Container(
                  height: height,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(height / 2),
                  ),
                ),
              ),
              Positioned(
                top: 0,
                left: (width * pace.clamp(0.0, 1.0) - 1)
                    .clamp(0.0, math.max(0.0, width - 2)),
                child: Container(
                  width: 2,
                  height: height + 6,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(1),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
