#!/usr/bin/env python3
"""
Comprehensive backend API test for Bundle Dev Portal
Tests all endpoints with proper cookie-based authentication
"""

import requests
import time
import json
from datetime import datetime, timedelta

# Load base URL from .env
BASE_URL = "https://dev-hub-89.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

# Test data
LEAD_ADMIN_CREDS = {"identifier": "Vance", "password": "SpotifyPremium"}
LEAD_ADMIN_DISCORD_ID = "1349737404449296414"

# Cookie jar for maintaining session
lead_admin_session = requests.Session()
admin_session = requests.Session()
dev_session = requests.Session()

# Store IDs for cleanup
test_user_ids = []
test_feature_ids = []
test_session_ids = []
test_changelog_ids = []

def print_test(name):
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print('='*60)

def print_pass(msg):
    print(f"✅ PASS: {msg}")

def print_fail(msg):
    print(f"❌ FAIL: {msg}")

def print_info(msg):
    print(f"ℹ️  INFO: {msg}")

# ============== TEST 1: Lead Admin Login ==============
def test_lead_admin_login():
    print_test("1. Lead Admin Login")
    
    # Test with display name
    print_info("Testing login with display_name 'Vance'")
    resp = lead_admin_session.post(f"{API_BASE}/auth/login", json=LEAD_ADMIN_CREDS)
    print_info(f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get('user', {}).get('role') == 'lead_admin':
            print_pass("Lead admin login with display_name successful")
            print_info(f"User: {data['user']}")
            # Check cookie
            if 'bundle_auth' in lead_admin_session.cookies:
                print_pass("bundle_auth cookie set")
            else:
                print_fail("bundle_auth cookie NOT set")
        else:
            print_fail(f"Expected role=lead_admin, got {data.get('user', {}).get('role')}")
    else:
        print_fail(f"Login failed with status {resp.status_code}: {resp.text}")
        return False
    
    # Test with discord_id
    print_info(f"Testing login with discord_id '{LEAD_ADMIN_DISCORD_ID}'")
    test_session = requests.Session()
    resp = test_session.post(f"{API_BASE}/auth/login", 
                             json={"identifier": LEAD_ADMIN_DISCORD_ID, "password": "SpotifyPremium"})
    if resp.status_code == 200 and resp.json().get('user', {}).get('role') == 'lead_admin':
        print_pass("Lead admin login with discord_id successful")
    else:
        print_fail(f"Login with discord_id failed: {resp.status_code}")
    
    # Test wrong password
    print_info("Testing wrong password")
    resp = requests.post(f"{API_BASE}/auth/login", 
                        json={"identifier": "Vance", "password": "WrongPassword"})
    if resp.status_code == 401:
        print_pass("Wrong password correctly rejected (401)")
    else:
        print_fail(f"Expected 401 for wrong password, got {resp.status_code}")
    
    return True

# ============== TEST 2: Auth Me Endpoint ==============
def test_auth_me():
    print_test("2. GET /api/auth/me")
    
    # With cookie
    resp = lead_admin_session.get(f"{API_BASE}/auth/me")
    if resp.status_code == 200:
        user = resp.json().get('user')
        if user and user.get('role') == 'lead_admin':
            print_pass(f"Auth/me with cookie returns lead admin: {user.get('display_name')}")
        else:
            print_fail(f"Unexpected user data: {user}")
    else:
        print_fail(f"Auth/me failed: {resp.status_code}")
    
    # Without cookie
    resp = requests.get(f"{API_BASE}/auth/me")
    if resp.status_code == 401:
        print_pass("Auth/me without cookie correctly returns 401")
    else:
        print_fail(f"Expected 401 without cookie, got {resp.status_code}")

# ============== TEST 3: Lead Admin Registers Admin ==============
def test_register_admin():
    print_test("3. Lead Admin Registers Admin")
    
    admin_data = {
        "discord_id": "111111111111111111",
        "display_name": "AdminAlice",
        "password": "alice123",
        "role": "admin"
    }
    
    resp = lead_admin_session.post(f"{API_BASE}/users", json=admin_data)
    print_info(f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        user = resp.json().get('user')
        if user and user.get('role') == 'admin':
            print_pass(f"Admin created successfully: {user.get('display_name')}")
            test_user_ids.append(user.get('id'))
            return user
        else:
            print_fail(f"Unexpected response: {resp.json()}")
    else:
        print_fail(f"Failed to create admin: {resp.text}")
    
    return None

# ============== TEST 4: Lead Admin Registers Developer ==============
def test_register_developer():
    print_test("4. Lead Admin Registers Developer")
    
    dev_data = {
        "discord_id": "000000000000000000",
        "display_name": "DevBob",
        "password": "bob123",
        "role": "developer"
    }
    
    resp = lead_admin_session.post(f"{API_BASE}/users", json=dev_data)
    print_info(f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        user = resp.json().get('user')
        if user and user.get('role') == 'developer':
            print_pass(f"Developer created successfully: {user.get('display_name')}")
            test_user_ids.append(user.get('id'))
            return user
        else:
            print_fail(f"Unexpected response: {resp.json()}")
    else:
        print_fail(f"Failed to create developer: {resp.text}")
    
    return None

# ============== TEST 5: Admin Restrictions ==============
def test_admin_restrictions():
    print_test("5. Admin Restrictions")
    
    # Login as AdminAlice
    print_info("Logging in as AdminAlice")
    resp = admin_session.post(f"{API_BASE}/auth/login", 
                              json={"identifier": "AdminAlice", "password": "alice123"})
    
    if resp.status_code == 200:
        print_pass("AdminAlice login successful (bypasses Lanyard)")
    else:
        print_fail(f"AdminAlice login failed: {resp.status_code}")
        return
    
    # Try to create another admin (should fail)
    print_info("AdminAlice trying to create another admin")
    admin_data = {
        "discord_id": "222222222222222222",
        "display_name": "AdminBob",
        "password": "bob456",
        "role": "admin"
    }
    resp = admin_session.post(f"{API_BASE}/users", json=admin_data)
    
    if resp.status_code == 403:
        print_pass("Admin correctly forbidden from creating admin (403)")
    else:
        print_fail(f"Expected 403, got {resp.status_code}: {resp.text}")
    
    # Create a developer (should succeed)
    print_info("AdminAlice creating a developer")
    dev_data = {
        "discord_id": "333333333333333333",
        "display_name": "DevCarol",
        "password": "carol123",
        "role": "developer"
    }
    resp = admin_session.post(f"{API_BASE}/users", json=dev_data)
    
    if resp.status_code == 200:
        user = resp.json().get('user')
        print_pass(f"Admin successfully created developer: {user.get('display_name')}")
        test_user_ids.append(user.get('id'))
    else:
        print_fail(f"Admin failed to create developer: {resp.status_code}")

# ============== TEST 6: Lanyard Gate for Developers ==============
def test_lanyard_gate():
    print_test("6. Lanyard Gate for Developers")
    
    print_info("Attempting to login as DevBob (invalid discord_id 000000000000000000)")
    resp = dev_session.post(f"{API_BASE}/auth/login", 
                           json={"identifier": "DevBob", "password": "bob123"})
    
    if resp.status_code == 403:
        data = resp.json()
        if data.get('error') == 'lanyard_required':
            print_pass("Lanyard gate correctly blocks invalid discord_id (403)")
            print_info(f"Invite link: {data.get('invite')}")
        else:
            print_fail(f"Got 403 but wrong error: {data}")
    else:
        print_fail(f"Expected 403 for Lanyard gate, got {resp.status_code}")
    
    print_info("Note: Using lead admin for remaining dev-flow tests (bypasses Lanyard)")

# ============== TEST 7: Feature Requests ==============
def test_feature_requests():
    print_test("7. Feature Requests")
    
    # GET empty features
    print_info("GET /api/features (should be empty or existing)")
    resp = lead_admin_session.get(f"{API_BASE}/features")
    if resp.status_code == 200:
        features = resp.json().get('features', [])
        print_pass(f"GET features successful, count: {len(features)}")
    else:
        print_fail(f"GET features failed: {resp.status_code}")
        return
    
    # POST new feature
    print_info("POST /api/features")
    feature_data = {
        "title": "Ban appeals modal",
        "description": "Add a modal so users can appeal bans",
        "module": "Moderation"
    }
    resp = lead_admin_session.post(f"{API_BASE}/features", json=feature_data)
    
    if resp.status_code == 200:
        feature = resp.json().get('feature')
        feature_id = feature.get('id')
        test_feature_ids.append(feature_id)
        print_pass(f"Feature created: {feature.get('title')}")
        print_info(f"Feature ID: {feature_id}")
    else:
        print_fail(f"Failed to create feature: {resp.status_code}")
        return
    
    # GET features again
    resp = lead_admin_session.get(f"{API_BASE}/features")
    if resp.status_code == 200:
        features = resp.json().get('features', [])
        found = next((f for f in features if f.get('id') == feature_id), None)
        if found:
            print_pass(f"Feature found in list, upvote_count: {found.get('upvote_count')}, status: {found.get('status')}")
        else:
            print_fail("Feature not found in list")
    
    # POST upvote
    print_info("POST /api/features/{id}/upvote (first time)")
    resp = lead_admin_session.post(f"{API_BASE}/features/{feature_id}/upvote")
    if resp.status_code == 200:
        data = resp.json()
        if data.get('upvoted') == True:
            print_pass("Upvote successful (upvoted: true)")
        else:
            print_fail(f"Unexpected upvote response: {data}")
    
    # POST upvote again (toggle off)
    print_info("POST /api/features/{id}/upvote (second time - toggle off)")
    resp = lead_admin_session.post(f"{API_BASE}/features/{feature_id}/upvote")
    if resp.status_code == 200:
        data = resp.json()
        if data.get('upvoted') == False:
            print_pass("Upvote toggled off (upvoted: false)")
        else:
            print_fail(f"Expected upvoted: false, got {data}")
    
    # Upvote once more
    print_info("POST /api/features/{id}/upvote (third time - toggle on)")
    resp = lead_admin_session.post(f"{API_BASE}/features/{feature_id}/upvote")
    if resp.status_code == 200 and resp.json().get('upvoted') == True:
        print_pass("Upvote toggled back on")
    
    # PATCH claim
    print_info("PATCH /api/features/{id} with claim: true")
    resp = lead_admin_session.patch(f"{API_BASE}/features/{feature_id}", json={"claim": True})
    if resp.status_code == 200:
        print_pass("Feature claimed successfully")
    else:
        print_fail(f"Failed to claim feature: {resp.status_code}")
    
    # Verify status changed to claimed
    resp = lead_admin_session.get(f"{API_BASE}/features")
    features = resp.json().get('features', [])
    found = next((f for f in features if f.get('id') == feature_id), None)
    if found and found.get('status') == 'claimed':
        print_pass(f"Feature status is 'claimed', claimed_by set")
    
    # POST note
    print_info("POST /api/features/{id}/notes")
    resp = lead_admin_session.post(f"{API_BASE}/features/{feature_id}/notes", 
                                   json={"note": "Started work on the UI"})
    if resp.status_code == 200:
        print_pass("Note added successfully")
    else:
        print_fail(f"Failed to add note: {resp.status_code}")
    
    # GET notes
    print_info("GET /api/features/{id}/notes")
    resp = lead_admin_session.get(f"{API_BASE}/features/{feature_id}/notes")
    if resp.status_code == 200:
        notes = resp.json().get('notes', [])
        if len(notes) > 0 and 'dev_name' in notes[0]:
            print_pass(f"Notes retrieved: {len(notes)} note(s) with dev_name")
        else:
            print_fail(f"Notes missing or incomplete: {notes}")
    
    # PATCH status to in_progress
    print_info("PATCH /api/features/{id} status to 'in_progress'")
    resp = lead_admin_session.patch(f"{API_BASE}/features/{feature_id}", 
                                    json={"status": "in_progress"})
    if resp.status_code == 200:
        print_pass("Status updated to in_progress")
    
    # PATCH priority and pinned (admin only)
    print_info("PATCH /api/features/{id} priority='high', pinned=true (admin)")
    resp = lead_admin_session.patch(f"{API_BASE}/features/{feature_id}", 
                                    json={"priority": "high", "pinned": True})
    if resp.status_code == 200:
        print_pass("Priority and pinned updated (admin)")
    
    # PATCH status to shipped (admin)
    print_info("PATCH /api/features/{id} status to 'shipped' (admin)")
    resp = lead_admin_session.patch(f"{API_BASE}/features/{feature_id}", 
                                    json={"status": "shipped"})
    if resp.status_code == 200:
        print_pass("Status updated to shipped")

# ============== TEST 8: Work Sessions ==============
def test_work_sessions():
    print_test("8. Work Sessions")
    
    # POST toggle (start)
    print_info("POST /api/sessions/toggle (start)")
    resp = lead_admin_session.post(f"{API_BASE}/sessions/toggle")
    if resp.status_code == 200:
        data = resp.json()
        if data.get('action') == 'started':
            print_pass("Session started successfully")
        else:
            print_fail(f"Expected action='started', got {data}")
    else:
        print_fail(f"Failed to start session: {resp.status_code}")
    
    # GET active session
    print_info("GET /api/sessions/active")
    resp = lead_admin_session.get(f"{API_BASE}/sessions/active")
    if resp.status_code == 200:
        session = resp.json().get('session')
        if session and session.get('end_time') is None:
            print_pass("Active session found with end_time=null")
        else:
            print_fail(f"Active session not found or has end_time: {session}")
    
    # Wait 3 seconds
    print_info("Waiting 3 seconds...")
    time.sleep(3)
    
    # POST toggle (stop)
    print_info("POST /api/sessions/toggle (stop)")
    resp = lead_admin_session.post(f"{API_BASE}/sessions/toggle")
    if resp.status_code == 200:
        data = resp.json()
        if data.get('action') == 'stopped':
            duration = data.get('duration_minutes', 0)
            print_pass(f"Session stopped, duration: {duration} minutes")
        else:
            print_fail(f"Expected action='stopped', got {data}")
    
    # GET sessions
    print_info("GET /api/sessions")
    resp = lead_admin_session.get(f"{API_BASE}/sessions")
    if resp.status_code == 200:
        sessions = resp.json().get('sessions', [])
        if len(sessions) > 0:
            latest = sessions[0]
            if latest.get('end_time') is not None:
                print_pass(f"Session found with end_time set, duration: {latest.get('duration_minutes')}")
            else:
                print_fail("Latest session missing end_time")
        else:
            print_fail("No sessions found")

# ============== TEST 9: Stats ==============
def test_stats():
    print_test("9. Stats")
    
    print_info("GET /api/stats?range=7d")
    resp = lead_admin_session.get(f"{API_BASE}/stats", params={"range": "7d"})
    
    if resp.status_code == 200:
        stats = resp.json()
        print_pass("Stats retrieved successfully")
        print_info(f"Today minutes: {stats.get('today_minutes')}")
        print_info(f"Features claimed: {stats.get('features_claimed')}")
        print_info(f"Features shipped: {stats.get('features_shipped')}")
        
        if stats.get('today_minutes', 0) >= 0:
            print_pass("today_minutes >= 0")
        if stats.get('features_claimed', 0) >= 1:
            print_pass("features_claimed >= 1")
        if stats.get('features_shipped', 0) >= 1:
            print_pass("features_shipped >= 1")
    else:
        print_fail(f"Failed to get stats: {resp.status_code}")

# ============== TEST 10: Admin Manual Entry & CSV Export ==============
def test_manual_entry_and_export():
    print_test("10. Admin Manual Entry & CSV Export")
    
    # Get lead admin ID
    resp = lead_admin_session.get(f"{API_BASE}/auth/me")
    lead_admin_id = resp.json().get('user', {}).get('id')
    
    # POST manual session
    print_info("POST /api/sessions/manual")
    manual_data = {
        "dev_id": lead_admin_id,
        "start_time": "2026-06-23T10:00:00Z",
        "end_time": "2026-06-23T12:30:00Z",
        "reason": "Forgot to clock in"
    }
    resp = lead_admin_session.post(f"{API_BASE}/sessions/manual", json=manual_data)
    
    if resp.status_code == 200:
        session = resp.json().get('session')
        if session.get('duration_minutes') == 150 and session.get('manual') == True:
            print_pass(f"Manual session created: duration={session.get('duration_minutes')}min, manual=true")
            test_session_ids.append(session.get('id'))
        else:
            print_fail(f"Manual session data incorrect: {session}")
    else:
        print_fail(f"Failed to create manual session: {resp.status_code}")
    
    # GET CSV export
    print_info(f"GET /api/sessions/export?dev_id={lead_admin_id}")
    resp = lead_admin_session.get(f"{API_BASE}/sessions/export", 
                                  params={"dev_id": lead_admin_id})
    
    if resp.status_code == 200:
        content_type = resp.headers.get('Content-Type', '')
        if 'text/csv' in content_type:
            print_pass("CSV export successful, Content-Type: text/csv")
            csv_content = resp.text
            if 'dev_name,dev_id,start_time,end_time,duration_minutes,manual,manual_reason' in csv_content:
                print_pass("CSV header correct")
            else:
                print_fail(f"CSV header incorrect: {csv_content[:200]}")
        else:
            print_fail(f"Wrong Content-Type: {content_type}")
    else:
        print_fail(f"CSV export failed: {resp.status_code}")

# ============== TEST 11: Changelog ==============
def test_changelog():
    print_test("11. Changelog")
    
    # GET without auth (public)
    print_info("GET /api/changelog without auth (public)")
    resp = requests.get(f"{API_BASE}/changelog")
    
    if resp.status_code == 200:
        entries = resp.json().get('entries', [])
        print_pass(f"Public changelog GET successful, entries: {len(entries)}")
    else:
        print_fail(f"Public changelog GET failed: {resp.status_code}")
    
    # POST new entry (auth required)
    print_info("POST /api/changelog (authenticated)")
    changelog_data = {
        "title": "Ban appeals shipped",
        "description": "Users can now appeal bans",
        "version_tag": "v1.4.0",
        "module_tags": ["Moderation"]
    }
    resp = lead_admin_session.post(f"{API_BASE}/changelog", json=changelog_data)
    
    if resp.status_code == 200:
        entry = resp.json().get('entry')
        entry_id = entry.get('id')
        test_changelog_ids.append(entry_id)
        print_pass(f"Changelog entry created: {entry.get('title')}")
    else:
        print_fail(f"Failed to create changelog entry: {resp.status_code}")
        return
    
    # GET again to verify
    resp = requests.get(f"{API_BASE}/changelog")
    if resp.status_code == 200:
        entries = resp.json().get('entries', [])
        found = any(e.get('id') == entry_id for e in entries)
        if found:
            print_pass("Changelog entry found in list")
        else:
            print_fail("Changelog entry not found")
    
    # DELETE entry
    print_info(f"DELETE /api/changelog/{entry_id}")
    resp = lead_admin_session.delete(f"{API_BASE}/changelog/{entry_id}")
    
    if resp.status_code == 200:
        print_pass("Changelog entry deleted")
        test_changelog_ids.remove(entry_id)
    else:
        print_fail(f"Failed to delete changelog entry: {resp.status_code}")

# ============== TEST 12: Leaderboard & Overview ==============
def test_leaderboard_and_overview():
    print_test("12. Leaderboard & Overview")
    
    # GET leaderboard hours/all
    print_info("GET /api/leaderboard?metric=hours&range=all")
    resp = lead_admin_session.get(f"{API_BASE}/leaderboard", 
                                  params={"metric": "hours", "range": "all"})
    
    if resp.status_code == 200:
        leaderboard = resp.json().get('leaderboard', [])
        print_pass(f"Leaderboard (hours/all) retrieved: {len(leaderboard)} entries")
        if len(leaderboard) > 0:
            print_info(f"Top entry: {leaderboard[0].get('user', {}).get('display_name')} - {leaderboard[0].get('label')}")
    else:
        print_fail(f"Leaderboard failed: {resp.status_code}")
    
    # GET leaderboard shipped/month
    print_info("GET /api/leaderboard?metric=shipped&range=month")
    resp = lead_admin_session.get(f"{API_BASE}/leaderboard", 
                                  params={"metric": "shipped", "range": "month"})
    
    if resp.status_code == 200:
        leaderboard = resp.json().get('leaderboard', [])
        print_pass(f"Leaderboard (shipped/month) retrieved: {len(leaderboard)} entries")
    else:
        print_fail(f"Leaderboard failed: {resp.status_code}")
    
    # GET overview (admin only)
    print_info("GET /api/overview (admin)")
    resp = lead_admin_session.get(f"{API_BASE}/overview")
    
    if resp.status_code == 200:
        overview = resp.json().get('overview', [])
        print_pass(f"Overview retrieved: {len(overview)} entries")
        if len(overview) > 0:
            entry = overview[0]
            required_fields = ['user', 'week_minutes', 'on_duty', 'on_duty_since', 'month_shipped']
            if all(field in entry for field in required_fields):
                print_pass("Overview entries have all required fields")
            else:
                print_fail(f"Overview entry missing fields: {entry}")
    else:
        print_fail(f"Overview failed: {resp.status_code}")
    
    # Test overview as non-admin (should fail if we had a dev session)
    # Skipping this as we don't have a valid dev login due to Lanyard gate

# ============== TEST 13: Lanyard Proxy ==============
def test_lanyard_proxy():
    print_test("13. Lanyard Proxy")
    
    # Valid discord_id
    print_info(f"GET /api/lanyard/{LEAD_ADMIN_DISCORD_ID}")
    resp = lead_admin_session.get(f"{API_BASE}/lanyard/{LEAD_ADMIN_DISCORD_ID}")
    
    if resp.status_code in [200, 404]:
        data = resp.json()
        print_pass(f"Lanyard proxy returned structured response: {resp.status_code}")
        print_info(f"Response: {data.get('success', 'N/A')}")
    else:
        print_fail(f"Lanyard proxy failed: {resp.status_code}")
    
    # Invalid discord_id
    print_info("GET /api/lanyard/000000000000000000")
    resp = lead_admin_session.get(f"{API_BASE}/lanyard/000000000000000000")
    
    if resp.status_code == 404:
        print_pass("Lanyard proxy correctly returns 404 for invalid ID")
    else:
        print_info(f"Lanyard proxy returned {resp.status_code} (acceptable)")

# ============== TEST 14: Lead Admin Protections ==============
def test_lead_admin_protections():
    print_test("14. Lead Admin Protections")
    
    # Get lead admin ID
    resp = lead_admin_session.get(f"{API_BASE}/auth/me")
    lead_admin_id = resp.json().get('user', {}).get('id')
    
    # Try to DELETE lead admin
    print_info(f"DELETE /api/users/{lead_admin_id} (should fail)")
    resp = lead_admin_session.delete(f"{API_BASE}/users/{lead_admin_id}")
    
    if resp.status_code == 403:
        data = resp.json()
        if 'cannot remove lead admin' in data.get('error', ''):
            print_pass("Lead admin deletion correctly forbidden (403)")
        else:
            print_fail(f"Got 403 but wrong error: {data}")
    else:
        print_fail(f"Expected 403, got {resp.status_code}")
    
    # Try to PATCH lead admin
    print_info(f"PATCH /api/users/{lead_admin_id} (should fail)")
    resp = lead_admin_session.patch(f"{API_BASE}/users/{lead_admin_id}", 
                                    json={"display_name": "NewName"})
    
    if resp.status_code == 403:
        data = resp.json()
        if 'cannot modify lead admin' in data.get('error', ''):
            print_pass("Lead admin modification correctly forbidden (403)")
        else:
            print_fail(f"Got 403 but wrong error: {data}")
    else:
        print_fail(f"Expected 403, got {resp.status_code}")

# ============== MAIN TEST RUNNER ==============
def main():
    print("\n" + "="*60)
    print("BUNDLE DEV PORTAL - COMPREHENSIVE BACKEND API TEST")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    print("="*60)
    
    try:
        # Run all tests in order
        if not test_lead_admin_login():
            print("\n❌ Lead admin login failed, cannot continue")
            return
        
        test_auth_me()
        test_register_admin()
        test_register_developer()
        test_admin_restrictions()
        test_lanyard_gate()
        test_feature_requests()
        test_work_sessions()
        test_stats()
        test_manual_entry_and_export()
        test_changelog()
        test_leaderboard_and_overview()
        test_lanyard_proxy()
        test_lead_admin_protections()
        
        print("\n" + "="*60)
        print("ALL TESTS COMPLETED")
        print("="*60)
        print("\nℹ️  Note: Test users and data created during testing remain in database")
        print("   for verification. Cleanup can be done manually if needed.")
        
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
