#!/bin/bash

#   NOTE:
#   Add these three lines to your .tmux.conf 
#   To get the status in your tmux bar
#   set -g status-right-length 100
#   set -g status-interval 600  # Update every 10 minutes
#   set -g status-right "#(~/path/to/gym-status.sh) | %H:%M"



LOCATION_ID="b99cf753-f4ad-4bfd-8b56-32dac8e45349"  # Your favorite gym
BASE_URL="https://visits.evofitness.no/api/v1/locations/${LOCATION_ID}"

# Fetch current data and timeline
CURRENT_DATA=$(curl -s "${BASE_URL}/current")
TIMELINE_DATA=$(curl -s "${BASE_URL}/timeline")

# Extract current occupancy
CURRENT=$(echo "$CURRENT_DATA" | jq -r '.current // 0')
PERCENT=$(echo "$CURRENT_DATA" | jq -r '.percentageUsed // 0' | cut -d'.' -f1)

# Extract location name and remove "EVO " prefix
NAME=$(echo "$TIMELINE_DATA" | jq -r '.name // "Gym"' | sed 's/^EVO //')

# Unicode block characters for different heights (bottom to top)
# ▁ ▂ ▃ ▄ ▅ ▆ ▇ █
get_bar_char() {
    local pct=$1
    if [ "$pct" -ge 88 ]; then echo "█"
    elif [ "$pct" -ge 75 ]; then echo "▇"
    elif [ "$pct" -ge 63 ]; then echo "▆"
    elif [ "$pct" -ge 50 ]; then echo "▅"
    elif [ "$pct" -ge 38 ]; then echo "▄"
    elif [ "$pct" -ge 25 ]; then echo "▃"
    elif [ "$pct" -ge 13 ]; then echo "▂"
    else echo "▁"
    fi
}

# Build the timeline bar
BAR=""
if [ -n "$TIMELINE_DATA" ] && [ "$TIMELINE_DATA" != "null" ]; then
    # Parse intervals and build bar
    INTERVALS=$(echo "$TIMELINE_DATA" | jq -c '.intervals[]')
    
    while IFS= read -r interval; do
        STATUS=$(echo "$interval" | jq -r '.status')
        PCT=$(echo "$interval" | jq -r '.percentageUsed // 0' | cut -d'.' -f1)
        
        # Get the appropriate bar character for this percentage
        CHAR=$(get_bar_char "$PCT")
        
        # Color based on status
        case "$STATUS" in
            "current")
                # Current interval - full color based on capacity
                if [ "$PCT" -ge 75 ]; then
                    BAR="${BAR}#[fg=red,bold]${CHAR}#[default]"
                elif [ "$PCT" -ge 50 ]; then
                    BAR="${BAR}#[fg=yellow,bold]${CHAR}#[default]"
                else
                    BAR="${BAR}#[fg=green,bold]${CHAR}#[default]"
                fi
                ;;
            "historic")
                # Historic - darkest grey
                BAR="${BAR}#[fg=colour235]${CHAR}#[default]"
                ;;
            "future")
                # Future - medium grey
                BAR="${BAR}#[fg=colour243]${CHAR}#[default]"
                ;;
        esac
    done <<< "$INTERVALS"
fi

# Color current percentage
if [ "$PERCENT" -ge 75 ]; then
    COLOR="#[fg=red]"
elif [ "$PERCENT" -ge 50 ]; then
    COLOR="#[fg=yellow]"
else
    COLOR="#[fg=green]"
fi

# Output: Name | Bar | Current
echo "EVO - ${NAME} ${BAR} ${COLOR}${PERCENT}%#[default]"
