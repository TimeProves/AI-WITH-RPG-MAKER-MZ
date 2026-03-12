Feature: RPG Maker MZ AI workbench behavior
  In order to review AI-generated game content with confidence
  As a game designer working in RPG Maker MZ
  I want behavior-focused scenarios that describe what the tool and NPC systems must do

  Background:
    Given the AI workbench is configured with a valid local project directory
    And the target RPG Maker MZ project contains MapInfos, System, CommonEvents, and Items data

  # Copy this file and replace the placeholders with real map names, NPC ids, and state ids.
  # Keep scenario names readable enough that a non-engineer can judge pass/fail from the test report.

  Scenario: Project explorer shows the generated map hierarchy
    Given the project contains a main map called "<main_map>"
    And the project contains a submap called "<sub_map>" under "<main_map>"
    When I load the project overview
    Then the explorer should show "<main_map>" at the top level
    And the explorer should show "<sub_map>" under "<main_map>"

  Scenario: NPC profile editing updates both profile data and map event data
    Given an AI NPC with id "<npc_id>" exists on map "<main_map>"
    When I update the NPC background to "<background_text>"
    And I change the NPC move type to "<move_type>"
    Then the project profile store should persist "<background_text>"
    And the target map event should use "<move_type>" as its move type

  Scenario: NPC dialogue changes when story state changes
    Given an AI NPC with id "<npc_id>" has a stage called "<stage_id>"
    And that stage requires switch "<switch_id>" to be ON
    When switch "<switch_id>" becomes ON
    Then the active dialogue stage for "<npc_id>" should become "<stage_id>"
    And the NPC opening line should match the stage definition

  Scenario: Moving an NPC to another map preserves its identity
    Given an AI NPC with id "<npc_id>" exists on map "<from_map>"
    When I move that NPC to map "<to_map>"
    Then the project overview should list "<npc_id>" under "<to_map>"
    And the old map should no longer contain that event id
    And the NPC profile id should remain "<npc_id>"

  Scenario: AI chat export produces an auditable transcript
    Given a player has an existing conversation with "<npc_id>"
    When the player exports the conversation as JSON
    Then the export should contain the npc id "<npc_id>"
    And the export should include ordered message history
    And the export should include the export timestamp

  Scenario: Backup restore rolls back generated changes
    Given I applied AI-generated content to the project
    When I restore the latest backup
    Then generated files from that apply should be removed or restored
    And the project data should match the backup contents
