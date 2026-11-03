import { describe, expect, it } from "vitest";
import { outlinePhp } from "../../src/emush/emush.ts";

describe("emush clean-room tools", () => {
  it("strips function bodies while preserving docblocks, signatures, and constants", () => {
    const samplePhp = `<?php
namespace App\\Actions;

/**
 * Camera breakdown mechanic.
 */
class CameraAction {
    public const BREAK_CHANCE = 25;
    protected const AP_COST = 2;

    /**
     * Checks if player can break the camera.
     */
    public function canExecute($player, $room): bool {
        if ($player->getAp() < self::AP_COST) {
            return false;
        }
        return true;
    }

    public function execute($player, $room) {
        $chance = self::BREAK_CHANCE;
        if (rand(1, 100) <= $chance) {
            $room->breakCamera();
        }
    }
}
`;

    const outlined = outlinePhp(samplePhp);

    // Verify docblock and class headers remain
    expect(outlined).toContain("Camera breakdown mechanic.");
    expect(outlined).toContain("class CameraAction");
    expect(outlined).toContain("public const BREAK_CHANCE = 25;");
    expect(outlined).toContain("Checks if player can break the camera.");

    // Verify signatures remain as abstract semicolons
    expect(outlined).toContain("public function canExecute($player, $room): bool;");
    expect(outlined).toContain("public function execute($player, $room);");

    // Critical invariant: verify internal method body code was STRIPPED
    expect(outlined).not.toContain("return false;");
    expect(outlined).not.toContain("$room->breakCamera();");
    expect(outlined).not.toContain("rand(1, 100)");
  });
});
