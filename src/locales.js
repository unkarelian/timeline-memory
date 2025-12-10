import { getCurrentLocale, addLocaleData, applyLocale } from '../../../../../scripts/i18n.js';

let tutorialTranslations = null;
let currentLocale = null;
let uiTranslationsLoaded = false;

/**
 * Load translations for the current locale and register with SillyTavern
 * @returns {Promise<Object>} Translation object or null if not found
 */
export async function loadTutorialTranslations() {
    const locale = getCurrentLocale() || 'en';

    // If already loaded for this locale, return cached
    if (tutorialTranslations && currentLocale === locale) {
        return tutorialTranslations;
    }

    currentLocale = locale;

    // Try to load the locale file
    const localeVariants = [
        locale,                          // e.g., 'es-es'
        locale.split('-')[0],            // e.g., 'es'
        `${locale.split('-')[0]}-${locale.split('-')[0]}` // e.g., 'es-es' from 'es'
    ];

    for (const variant of localeVariants) {
        try {
            const response = await fetch(`/scripts/extensions/third-party/timeline-memory/locales/${variant}.json`);
            if (response.ok) {
                tutorialTranslations = await response.json();
                console.log(`[Timeline Memory] Loaded translations for locale: ${variant}`);
                return tutorialTranslations;
            }
        } catch (e) {
            // Continue to next variant
        }
    }

    // No translation found, return null (will use English defaults)
    console.log(`[Timeline Memory] No translations found for locale: ${locale}, using English`);
    tutorialTranslations = null;
    return null;
}

/**
 * Load and register UI translations with SillyTavern's i18n system
 * Call this during extension initialization
 */
export async function loadUITranslations() {
    if (uiTranslationsLoaded) return;

    const locale = getCurrentLocale() || 'en';

    // Skip for English
    if (locale === 'en' || locale.startsWith('en-')) {
        uiTranslationsLoaded = true;
        return;
    }

    // Try to load the locale file
    const localeVariants = [
        locale,
        locale.split('-')[0],
        `${locale.split('-')[0]}-${locale.split('-')[0]}`
    ];

    for (const variant of localeVariants) {
        try {
            const response = await fetch(`/scripts/extensions/third-party/timeline-memory/locales/${variant}.json`);
            if (response.ok) {
                const translations = await response.json();

                // Register with SillyTavern's i18n system
                addLocaleData(locale, translations);

                console.log(`[Timeline Memory] Registered UI translations for locale: ${variant}`);
                uiTranslationsLoaded = true;
                return;
            }
        } catch (e) {
            // Continue to next variant
        }
    }

    console.log(`[Timeline Memory] No UI translations found for locale: ${locale}`);
    uiTranslationsLoaded = true;
}

/**
 * Apply translations to the extension's settings panel
 * Call this after the settings panel HTML is loaded
 * @param {HTMLElement|JQuery} container - The settings panel container
 */
export function applyExtensionLocale(container) {
    const element = container instanceof jQuery ? container[0] : container;
    if (element) {
        applyLocale(element);
    }
}

/**
 * Get a translated string for the tutorial
 * @param {string} key - Translation key
 * @param {string} fallback - Fallback English text
 * @returns {string} Translated text or fallback
 */
export function getTutorialText(key, fallback) {
    if (tutorialTranslations && tutorialTranslations[key]) {
        return tutorialTranslations[key];
    }
    return fallback;
}

/**
 * Check if a non-English locale is active
 * @returns {boolean}
 */
export function hasTranslations() {
    return tutorialTranslations !== null;
}

/**
 * Get the current locale code
 * @returns {string}
 */
export function getLocale() {
    return currentLocale || getCurrentLocale() || 'en';
}
