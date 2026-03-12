Feature: AI RPG Maker workbench local smoke behaviors
  In order to trust the local editing workflow
  As a maintainer of the AI RPG Maker workbench
  I want deterministic smoke scenarios that verify the core non-provider behaviors

  Scenario: Generated interiors are nested under the main map
    Given a fresh temporary RPG Maker MZ project
    When I build the example city skeleton
    Then generated interior maps should have the city map as their parent

  Scenario: Project overview returns a map to NPC directory tree
    Given a generated city skeleton exists
    When I request the project overview
    Then the overview should include at least one map
    And the overview should include at least one AI NPC
    And the overview tree should expose map and submap structure

  Scenario: Saving an NPC updates profile and event data
    Given an AI NPC exists in the generated project
    When I save updated profile and movement values for that NPC
    Then AiNpcProfiles.json should contain the new background
    And the source map event should contain the updated move type

  Scenario: Moving an NPC to another map preserves its stages
    Given an AI NPC exists in the generated project
    When I move that NPC to a different map and save one dialogue stage
    Then the new map should contain the NPC event
    And the old map should no longer contain that event id
    And AiNpcProfiles.json should still contain the saved stage
