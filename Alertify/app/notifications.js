import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { subscribeNotifications, clearNotifications } from '../src/api/notificationStore';

const ITEMS_PER_PAGE = 10;
  
function formatTimestamp(ts) {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${month} ${day}, ${h12}:${minutes} ${ampm}`;
}

function iconForType(type) {
  switch (type) {
    case 'helmet-missing':
      return { name: 'warning', color: '#FF3B30', bg: 'rgba(255, 59, 48, 0.1)' };
    case 'helmet-returned':
      return { name: 'checkmark-circle', color: '#34C759', bg: 'rgba(52, 199, 89, 0.1)' };
    case 'face-unknown':
      return { name: 'person-remove-outline', color: '#FF3B30', bg: 'rgba(255, 59, 48, 0.1)' };
    case 'face-owner':
      return { name: 'person-circle-outline', color: '#34C759', bg: 'rgba(52, 199, 89, 0.1)' };
    default:
      return { name: 'information-circle', color: '#0A84FF', bg: 'rgba(10, 132, 255, 0.1)' };
  }
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const unsubscribe = subscribeNotifications(setNotifications);
    return unsubscribe;
  }, []);

  // Filter data
  const filteredData = useMemo(() => {
    if (!searchQuery) return notifications;
    const q = searchQuery.toLowerCase();
    return notifications.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
  }, [notifications, searchQuery]);

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const currentData = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredData, safePage]);

  const handleNextPage = () => {
    if (safePage < totalPages) setCurrentPage(safePage + 1);
  };

  const handlePrevPage = () => {
    if (safePage > 1) setCurrentPage(safePage - 1);
  };

  // Reset pagination on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleClearAll = () => {
    clearNotifications();
  };

  const renderItem = ({ item, index }) => {
    const icon = iconForType(item.type);
    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(400)} style={styles.notificationCard}>
        <View style={[styles.iconContainer, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={24} color={icon.color} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDesc}>{item.description}</Text>
          <Text style={styles.cardTime}>{formatTimestamp(item.timestamp)}</Text>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Notifications</Text>
          {notifications.length > 0 && (
            <Pressable onPress={handleClearAll} style={styles.clearButton}>
              <Text style={styles.clearText}>Clear All</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search notifications..."
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#8E8E93" />
          </Pressable>
        )}
      </Animated.View>

      <FlatList
        data={currentData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={48} color="#3A3A3C" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching notifications.' : 'No notifications yet.'}
            </Text>
            <Text style={styles.emptyHint}>
              {searchQuery
                ? 'Try a different search term.'
                : 'Helmet alerts will appear here in real time.'}
            </Text>
          </View>
        }
      />

      {filteredData.length > ITEMS_PER_PAGE && (
        <View style={styles.pagination}>
          <Pressable
            style={[styles.pageButton, safePage === 1 && styles.pageButtonDisabled]}
            onPress={handlePrevPage}
            disabled={safePage === 1}
          >
            <Ionicons name="chevron-back" size={24} color={safePage === 1 ? '#3A3A3C' : '#0A84FF'} />
          </Pressable>
          <Text style={styles.pageText}>
            Page {safePage} of {totalPages}
          </Text>
          <Pressable
            style={[styles.pageButton, safePage === totalPages && styles.pageButtonDisabled]}
            onPress={handleNextPage}
            disabled={safePage === totalPages}
          >
            <Ionicons name="chevron-forward" size={24} color={safePage === totalPages ? '#3A3A3C' : '#0A84FF'} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  clearText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF3B30',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    marginHorizontal: 24,
    paddingHorizontal: 16,
    height: 50,
    borderRadius: 25,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  cardTime: {
    fontSize: 12,
    color: '#5C5C5E',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  emptyHint: {
    color: '#5C5C5E',
    fontSize: 13,
    marginTop: 6,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    backgroundColor: '#121212',
  },
  pageButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageButtonDisabled: {
    backgroundColor: 'transparent',
  },
  pageText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '500',
  },
});
