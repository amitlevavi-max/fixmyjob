import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, TextInput, FlatList,
} from 'react-native';
import { Colors, Fonts, Radii } from '../theme';
import Icon from './Icon';
import IconTile from './IconTile';
import { STATES, StateData } from '../data/locationData';
import { t } from '../i18n';

export interface LocationResult {
  stateAbbr: string;
  stateName: string;
  isMetro: boolean;
  metroName?: string;
  /** Human-readable label, e.g. "Chicago, IL" or "Rural Illinois" */
  label: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: LocationResult) => void;
}

type Step = 'state' | 'area_type' | 'metro';

export default function LocationPicker({ visible, onClose, onSelect }: Props) {
  const [step, setStep] = useState<Step>('state');
  const [stateSearch, setStateSearch] = useState('');
  const [selectedState, setSelectedState] = useState<StateData | null>(null);

  function reset() {
    setStep('state');
    setStateSearch('');
    setSelectedState(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleStateSelect(state: StateData) {
    setSelectedState(state);
    setStateSearch('');
    setStep('area_type');
  }

  function handleRural() {
    if (!selectedState) return;
    onSelect({
      stateAbbr: selectedState.abbr,
      stateName: selectedState.name,
      isMetro: false,
      label: `Rural / suburban ${selectedState.name}`,
    });
    reset();
  }

  function handleMetroSelect(metroName: string) {
    if (!selectedState) return;
    onSelect({
      stateAbbr: selectedState.abbr,
      stateName: selectedState.name,
      isMetro: true,
      metroName,
      label: `${metroName}, ${selectedState.abbr}`,
    });
    reset();
  }

  function handleCityNoMetro() {
    if (!selectedState) return;
    // User said city but didn't pick a metro — use generic city for state
    onSelect({
      stateAbbr: selectedState.abbr,
      stateName: selectedState.name,
      isMetro: true,
      label: `City in ${selectedState.name}`,
    });
    reset();
  }

  const filteredStates = useMemo(() => {
    const q = stateSearch.toLowerCase();
    if (!q) return STATES;
    return STATES.filter(
      (s) =>
        s.name.toLowerCase().startsWith(q) ||
        s.abbr.toLowerCase().startsWith(q)
    );
  }, [stateSearch]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.overlay} onPress={handleClose} activeOpacity={1}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>

          {/* Handle bar */}
          <View style={styles.handle} />

          {/* ── Step: State picker ────────────────────────────────────────── */}
          {step === 'state' && (
            <>
              <Text style={styles.title}>{t('Which state do you work in?')}</Text>
              <TextInput
                style={styles.search}
                placeholder={t('Search state…')}
                placeholderTextColor={Colors.muted}
                value={stateSearch}
                onChangeText={setStateSearch}
                autoFocus
              />
              <FlatList
                data={filteredStates}
                keyExtractor={(s) => s.abbr}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.listRow}
                    onPress={() => handleStateSelect(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.listRowAbbr}>{item.abbr}</Text>
                    <Text style={styles.listRowName}>{item.name}</Text>
                    <Icon name="f:chevron-right" size={18} color={Colors.slate} />
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
              />
            </>
          )}

          {/* ── Step: City vs Rural ───────────────────────────────────────── */}
          {step === 'area_type' && selectedState && (
            <>
              <TouchableOpacity onPress={() => setStep('state')} style={styles.back}>
                <Text style={styles.backText}>← {selectedState.name}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{t('Where in {state}?', { state: selectedState.name })}</Text>
              <Text style={styles.sub}>
                {t('Wages vary a lot between cities and rural areas.')}
              </Text>

              <TouchableOpacity
                style={styles.areaBtn}
                onPress={() => setStep('metro')}
                activeOpacity={0.8}
              >
                <IconTile icon="city-variant-outline" size={42} style={styles.areaBtnIcon} />
                <View style={styles.areaBtnText}>
                  <Text style={styles.areaBtnLabel}>{t('City / metro area')}</Text>
                  <Text style={styles.areaBtnSub}>{t('I work in or near a city')}</Text>
                </View>
                <Icon name="f:chevron-right" size={20} color={Colors.slate} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.areaBtn}
                onPress={handleRural}
                activeOpacity={0.8}
              >
                <IconTile icon="pine-tree" size={42} style={styles.areaBtnIcon} />
                <View style={styles.areaBtnText}>
                  <Text style={styles.areaBtnLabel}>{t('Rural / suburban')}</Text>
                  <Text style={styles.areaBtnSub}>{t('Outside a major city')}</Text>
                </View>
                <Icon name="f:chevron-right" size={20} color={Colors.slate} />
              </TouchableOpacity>
            </>
          )}

          {/* ── Step: Metro area ──────────────────────────────────────────── */}
          {step === 'metro' && selectedState && (
            <>
              <TouchableOpacity onPress={() => setStep('area_type')} style={styles.back}>
                <Text style={styles.backText}>{t('← Back')}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{t('Which metro area?')}</Text>

              <ScrollView
                style={styles.list}
                keyboardShouldPersistTaps="handled"
              >
                {selectedState.metros.map((metro) => (
                  <TouchableOpacity
                    key={metro.name}
                    style={styles.listRow}
                    onPress={() => handleMetroSelect(metro.name)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.listRowName, { flex: 1 }]}>{metro.name}</Text>
                    <Icon name="f:chevron-right" size={18} color={Colors.slate} />
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[styles.listRow, styles.otherRow]}
                  onPress={handleCityNoMetro}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.listRowName, { flex: 1, color: Colors.muted }]}>
                    {t('Other city in {state}', { state: selectedState.name })}
                  </Text>
                  <Icon name="f:chevron-right" size={18} color={Colors.slate} />
                </TouchableOpacity>
              </ScrollView>
            </>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelText}>{t('Not now')}</Text>
          </TouchableOpacity>

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,10,20,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.denimDark,
    borderTopWidth: 1,
    borderColor: Colors.lineStrong,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 48,
    maxHeight: '82%',
    minHeight: '50%',
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.display,
    textTransform: 'uppercase',
    color: Colors.text,
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    fontFamily: 'Barlow_400Regular',
    color: Colors.muted,
    marginBottom: 16,
  },
  search: {
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    borderRadius: Radii.lg,
    marginTop: 8,
    padding: 12,
    fontSize: 15,
    fontFamily: 'Barlow_400Regular',
    color: Colors.text,
    marginBottom: 8,
  },
  list: {
    maxHeight: 340,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  listRowAbbr: {
    width: 36,
    fontSize: 13,
    fontFamily: 'Barlow_700Bold',
    color: Colors.accentHi,
  },
  listRowName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Barlow_400Regular',
    color: '#FFFFFF',
  },
  listRowChevron: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.40)',
    marginLeft: 8,
  },
  sep: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 4,
  },
  back: {
    marginBottom: 12,
  },
  backText: {
    fontSize: 14,
    fontFamily: 'Barlow_600SemiBold',
    color: Colors.accentHi,
  },
  areaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radii.lg,
    padding: 12,
    marginBottom: 10,
  },
  areaBtnIcon: {
    marginRight: 14,
  },
  areaBtnText: { flex: 1 },
  areaBtnLabel: {
    fontSize: 15,
    fontFamily: 'Barlow_700Bold',
    color: '#FFFFFF',
  },
  areaBtnSub: {
    fontSize: 12,
    fontFamily: 'Barlow_400Regular',
    color: Colors.muted,
    marginTop: 2,
  },
  areaBtnChevron: {
    fontSize: 20,
    color: Colors.muted,
  },
  otherRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: 'Barlow_600SemiBold',
    color: Colors.muted,
  },
});
