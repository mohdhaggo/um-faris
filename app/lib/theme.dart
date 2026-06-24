import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Brand palette (mirrors the original app): gold brand, maroon (عنابي) for
/// Gregorian dates, emerald for Hijri.
class AppColors {
  static const brand = Color(0xFFBD8035);
  static const brandDark = Color(0xFF7A4E26);
  static const maroon = Color(0xFF7A1733);
  static const emerald = Color(0xFF10B981);
  static const bg = Color(0xFFF7F5F1);
  static const ink = Color(0xFF2A2520);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorSchemeSeed: AppColors.brand,
    scaffoldBackgroundColor: AppColors.bg,
    brightness: Brightness.light,
  );
  return base.copyWith(
    textTheme: GoogleFonts.tajawalTextTheme(base.textTheme)
        .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFD6D3CE)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFD6D3CE)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.brand, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: GoogleFonts.tajawal(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
  );
}
