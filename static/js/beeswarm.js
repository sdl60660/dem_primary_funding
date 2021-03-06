
let tickCount = 0;

BeeSwarm = function(_parentElement) {
    this.parentElement = _parentElement;

    this.initVis();
};

BeeSwarm.prototype.initVis = function() {
    const vis = this;

    // Set height/width of viewBox
    vis.width = 1600;
    vis.height = 1100;

    // Initialize SVG
    vis.svg = d3.select(vis.parentElement)
        .append("svg")
        .attr("viewBox", [0, 0, vis.width*1.04, vis.height]);

    vis.projection = geoAlbersUsaPr()
        .scale(vis.width)
        .translate([vis.width / 2, vis.height / 2]);


    vis.beeswarmTransitionTime = 1500;

    // Add contribution totals to the properties of each state feature
    stateMap.features.forEach(state => {
        const trueCounts = stateSummaryCounts[state.properties.SHORT_NAME];
        let contributionCounts = summarizeContributionCounts(trueCounts);

        state.properties.contributionCounts = contributionCounts;
        // state.properties.donorCounts = {};
    });

    vis.uncategorizedMapData = {'properties':
            {'NAME': 'Donor Unknown/Transfer',
             'contributionCounts': summarizeContributionCounts(stateSummaryCounts['uncategorized'])}};

    vis.selfFundingMapData = {'properties':
            {'NAME': 'Self-Contributions',
             'contributionCounts': summarizeContributionCounts(stateSummaryCounts['self_contribution'])}};


    vis.usMap = vis.svg.append("g")
        // .attr("y", vis.height / 3)
        .selectAll("path")
        .data(stateMap.features)
        .join("path")
            .attr("id", d => `state-${d.properties.SHORT_NAME}`)
            .attr("fill", "white")
            .attr("d", d3.geoPath()
                .projection(vis.projection)
            )
            .style("stroke", "black")
            .attr("opacity", 0)
            .on("mouseover", (d,i,n) => {
                vis.tip.show(d, n[i]);

                let highlightTip = $(".beeswarm-state-tip");

                // Get screen coordinates of the corresponding plot bubble
                let stateY = n[i].getBoundingClientRect().y;

                // Get the height of the tooltip to offset
                let tooltipHeight = highlightTip[0].getBoundingClientRect().height;

                highlightTip
                    .css("position", "fixed")
                    .css("top", stateY - tooltipHeight);
            })
            .on("mouseout", d => vis.tip.hide());

    vis.stateCenters = {};
    stateMap.features.forEach(d => {
        let centroid = d3.geoPath().centroid(d);
        vis.stateCenters[d.properties.SHORT_NAME] = vis.projection(centroid);
    });

    // This is where all uncategorized data will lie (unreported individual donations/committee contributions)
    vis.stateCenters['uncategorized'] = [0.9*vis.width, 0.73*vis.height];
    vis.stateCenters['self_contribution'] = [0.9*vis.width, 0.45*vis.height];
    // Offset California by a little to avoid some of the Nevada overlap
    vis.stateCenters['CA'][0] -= 20;

    vis.includedBlocks = beeswarmMoneyBlocks.filter(d => d.state in vis.stateCenters);

    vis.beeswarm = vis.svg.append("g")
        .attr("id", "beeswarm-nodes")
        .selectAll("circle");

    vis.beeswarm = vis.beeswarm
        .data(vis.includedBlocks)
        .join("circle")
        .attr("class", "bee-node")
        .attr("cx", d => vis.stateCenters[d.state][0])
        .attr("cy", d => vis.stateCenters[d.state][1])
        .attr("r", 2.5)
        .attr("opacity", 1.0)
        // .style("stroke", "black")
        // .style("stroke-width", 0.5)
        .attr("fill", d => partyColor(d.party))
        .on("mouseover", d => {
            let featureData;
            let matchingState;

            if (d.state === 'uncategorized') {
                featureData = vis.uncategorizedMapData;
                matchingState = vis.uncategorizedHoverCircle.node();
            }
            else if (d.state === 'self_contribution') {
                featureData = vis.selfFundingMapData;
                matchingState = vis.selfFundedHoverCircle.node();
            }
            else {
                featureData = stateMap.features.find(x => x.properties.SHORT_NAME === d.state);
                matchingState = vis.svg.select(`#state-${d.state}`).node();
            }

            console.log(matchingState);

            vis.tip.show(featureData, matchingState);

            let highlightTip = $(".beeswarm-state-tip");

            // Get screen coordinates of the corresponding plot bubble
            let stateY = matchingState.getBoundingClientRect().y;

            // Get the height of the tooltip to offset
            let tooltipHeight = highlightTip[0].getBoundingClientRect().height;

            highlightTip
                .css("position", "fixed")
                .css("top", stateY - tooltipHeight);
        })
        .on("mouseout", d => vis.tip.hide());


    vis.partyCoordinates = d3.scaleOrdinal()
        .domain(['DEM', 'DFL', 'REP'])
        .range([[vis.width/3, vis.height/2], [vis.width/3, vis.height/2], [2*vis.width/3, vis.height/2]])
        .unknown([0.8*vis.width, vis.height/2]);

    vis.officeTypeCoordinates = d3.scaleOrdinal()
        .domain(['president', 'senate', 'house'])
        .range([[vis.width/3, 0.15*vis.height], [vis.width/3, 0.4*vis.height], [vis.width/3, 0.65*vis.height]])
        .unknown([vis.width/3, 0.8*vis.height]);


    vis.superPacBlocks = vis.svg.append("g")
        .attr("id", "superpac-nodes")
        .selectAll("circle");

    vis.pacBlocks = vis.superPacBlocks
        .data(superPACblocks, d => d)
        .join("circle")
        .attr("class", "pac-node")
        .attr("cx", d => vis.partyCoordinates(d.party)[0])
        .attr("cy", d => vis.height*.67)
        .attr("r", 0)
        .attr("opacity", 1.0)
        .attr("fill", d => partyColor(d.party));

    vis.tick = () => {
        tickCount += 1;

        vis.simulation.tick();

		d3.selectAll('.bee-node')
			.attr('cx', d => d.x)
			.attr('cy', d => d.y)
	};


    vis.simulation =
        d3.forceSimulation(vis.includedBlocks)
            .force('x', d3.forceX( d => (d.party === 'REP' ? 3 : -3) + vis.stateCenters[d.state][0]).strength(1.0))
            .force('y', d3.forceY( d => vis.stateCenters[d.state][1]).strength(0.9))
            .force('repel', d3.forceManyBody().strength(-20).distanceMax(5))
            .force('collide', d3.forceCollide(2.5).strength(0.8).iterations(2))
            // .alphaDecay(0.005)
            .alpha(0.12)
            .alphaDecay(0.004)
            .on('tick', vis.tick)
            .stop();

    vis.showMap();
    vis.sortByGeo();
};


BeeSwarm.prototype.sortByGeo = function() {
    const vis = this;

    vis.beeswarm
        .transition()
        .delay(500)
        .duration(vis.beeswarmTransitionTime)
        // .ease(d3.easeSin)
        .attr("cx", d => d.map_x)
        .attr("cy", d => d.map_y);


    const fixedTooltipCall = (d,i,n) => {
        vis.tip.show(d, n[i]);

        let highlightTip = $(".beeswarm-state-tip");

        // Get screen coordinates of the corresponding plot bubble
        let stateY = n[i].getBoundingClientRect().y;

        // Get the height of the tooltip to offset
        let tooltipHeight = highlightTip[0].getBoundingClientRect().height;

        highlightTip
            .css("position", "fixed")
            .css("top", stateY - tooltipHeight);
    };

    vis.uncategorizedHoverCircle = vis.svg.append("circle")
        .datum(vis.uncategorizedMapData)
        .attr("cx", 0.9*vis.width)
        .attr("cy", 0.73*vis.height)
        .attr("r", 120)
        .style("opacity", 0)
        .on("mouseover", (d,i,n) => fixedTooltipCall(d,i,n));

    vis.selfFundedHoverCircle = vis.svg.append("circle")
        .datum(vis.selfFundingMapData)
        .attr("cx", 0.9*vis.width)
        .attr("cy", 0.45*vis.height)
        .attr("r", 120)
        .style("opacity", 0)
        .on("mouseover", (d,i,n) => fixedTooltipCall(d,i,n));
};



BeeSwarm.prototype.highlightUncategorized = function() {
    const vis = this;

    vis.beeswarm
        .transition("highlight-uncategorized")
        .duration(500)
        .attr('opacity', d => (d.state === 'uncategorized' || d.state === 'self_contribution') ? 1.0 : 0.3);

};


BeeSwarm.prototype.resetHighlighting = function() {
    const vis = this;

    vis.beeswarm
        .transition("reset-highlighting")
        // .duration(500)
        .attr('opacity', 1.0);

};


BeeSwarm.prototype.sortByParty = function() {
    const vis = this;

    vis.uncategorizedHoverCircle.remove();
    vis.selfFundedHoverCircle.remove();

    vis.simulation
        // .alphaDecay(0.1)
        .alpha(0.12)
        .alphaDecay(0.004)
        .force('x', d3.forceX( d => vis.partyCoordinates(d.party)[0]).strength(0.9))
        .force('y', d3.forceY( d => vis.partyCoordinates(d.party)[1]).strength(0.9))
        .force('collide', d3.forceCollide(2.5).strength(1.0).iterations(2))
        // .restart();

    // for (let i = 0; i < 250; i++) vis.simulation.tick();
    // vis.beeswarm
    //     .transition()
    //     .duration(2000)
    //     .attr("cx", d => d.x)
    //     .attr("cy", d => d.y);

    vis.partyLabels = vis.svg.selectAll(".party-label-text")
        .data(['DEM', 'REP', 'Other'])
        .join("text")
        .attr("class", "party-label-text")
        .attr("x", d => vis.partyCoordinates(d)[0])
        .attr("y", vis.height / 3)
        .style("font-size", "24px")
        .style("text-anchor", "middle")
        .text(d => d);

    vis.beeswarm
        .transition()
        .duration(vis.beeswarmTransitionTime)
        // .ease(d3.easeSin)
        .attr("opacity", 1.0)
        .attr("cx", d => d.party_x)
        .attr("cy", d => d.party_y)
        // .on('mouseover', null)
        // .on('mouseout', null);

};


BeeSwarm.prototype.sortByOfficeType = function() {
    const vis = this;

    vis.simulation
        .alpha(0.13)
        .alphaDecay(0.004)
        // .force('x', d3.forceX( d => vis.officeTypeCoordinates(d.office_type)[0]).strength(0.8))
        .force('y', d3.forceY( d => vis.officeTypeCoordinates(d.race_type)[1]).strength(0.9))
        // .restart();

    vis.partyLabels
        .transition()
        .duration(1000)
        .attr("y", 19);

    vis.officeTypeLabels = vis.svg.selectAll(".office-type-text")
        .data(['President', 'Senate', 'House'])
        .join("text")
        .attr("id", d => `${d}-office-label`)
        .attr("class", "office-type-text")
        .attr("x", vis.width / 9)
        .attr("y", d => vis.officeTypeCoordinates(d.toLowerCase())[1])
        .attr("opacity", 1.0)
        .style("font-size", "24px")
        .style("text-anchor", "middle")
        .text(d => d)

    vis.beeswarm
        .transition()
        .duration(vis.beeswarmTransitionTime)
        // .ease(d3.easeSin)
        .attr("opacity", 1.0)
        .attr("cx", d => d.office_x)
        .attr("cy", d => d.office_y);

};


BeeSwarm.prototype.sortByCandidates = function() {
    const vis = this;

    // const partyGroups = [['DEM', 'DFL'], ['REP'], ['IND', 'LIB']];
    const offices = ['president', 'senate', 'house'];


    let candidateGroups = [];
    // partyGroups.forEach(partyGroup => {
    offices.forEach(officeType => {

        let candidateGroup = candidateMeta.slice()
            .filter(d => d.total_receipts !== "" && officeType === d.race_type) // && partyGroup.includes(d.party)
            .sort((a,b) => (b.total_receipts > a.total_receipts) ? 1 : -1)
            .slice(0,6);
            // .map(d => d.fec_id);

        // console.log(candidateGroup)
        candidateGroups.push(candidateGroup);

    });

    vis.presidentXScale = d3.scaleOrdinal()
        .domain(candidateGroups[0].map(d => d.fec_id))
        .range([0.25, 0.35, 0.45, 0.55, 0.65, 0.75])
        .unknown(0.9);

    vis.senateXScale = d3.scaleOrdinal()
        .domain(candidateGroups[1].map(d => d.fec_id))
        .range([0.25, 0.35, 0.45, 0.55, 0.65, 0.75])
        .unknown(0.9);

    vis.houseXScale = d3.scaleOrdinal()
        .domain(candidateGroups[2].map(d => d.fec_id))
        .range([0.25, 0.35, 0.45, 0.55, 0.65, 0.75])
        .unknown(0.9);

    vis.simulation
        .alpha(0.12)
        .alphaDecay(0.004)
        // .force('force', d3.forceManyBody().strength(-2))
        .force('x', d3.forceX( d => {
            if (d.race_type === "president") {
                return vis.presidentXScale(d.fec_id)*vis.width;
            }
            else if (d.race_type === "senate") {
                return vis.senateXScale(d.fec_id)*vis.width;
            }
            else {
                return vis.houseXScale(d.fec_id)*vis.width;
            }
            // vis.officeTypeCoordinates(d.office_type)[0]
        }).strength(0.9))
        .force('y', d3.forceY( d => (d.last_name==="BLOOMBERG" && d.first_name === "MICHAEL") ?
            vis.officeTypeCoordinates(d.race_type)[1] + 15 :
            vis.officeTypeCoordinates(d.race_type)[1]).strength(0.9))

        // .restart();

    let allCandidateLabels = candidateGroups.flat();
    vis.candidateLabels = vis.svg.selectAll(".candidate-label-text")
        .data(allCandidateLabels)
        .join("text")
        .attr("class", "candidate-label-text")
        .attr("x", d => {
            if (d.race_type === "president") {
                return vis.presidentXScale(d.fec_id)*vis.width;
            }
            else if (d.race_type === "senate") {
                return vis.senateXScale(d.fec_id)*vis.width;
            }
            else {
                return vis.houseXScale(d.fec_id)*vis.width;
            }
        })
        .attr("y", d => (d.race_type) === "president" ? vis.officeTypeCoordinates(d.race_type)[1] - 100 :
            vis.officeTypeCoordinates(d.race_type)[1] - 67)
        .attr("opacity", 1.0)
        .style("font-size", () => phoneBrowsing === true ? "18px" : "15px")
        .style("text-anchor", "middle")
        .attr("dy", "1.15em")
        .text(d => (phoneBrowsing === true) ? `${d.last_name}` : `${d.first_name} ${d.last_name}`)
        .call(wrap, vis.width/10 - 5);

    // Remaining Candidates Label
    vis.remainingCandidateLabel = vis.svg.append("text")
        .attr("class", "candidate-label-text")
        .attr("x", 0.9*vis.width)
        .attr("y", vis.officeTypeCoordinates("president")[1] - 100)
        .attr("dy", "1.15em")
        .style("font-size", () => phoneBrowsing === true ? "18px" : "15px")
        .style("text-anchor", "middle")
        .text("ALL OTHER CANDIDATES");


    vis.beeswarm
        .transition()
        .duration(vis.beeswarmTransitionTime)
        // .ease(d3.easeSin)
        .attr("opacity", 1.0)
        .attr("cx", d => d.candidate_x)
        .attr("cy", d => d.candidate_y);


    // d3.select("#beeswarm-area").append("select")
    //     .attr("x", vis.width*0.75)
    //     .attr("y", vis.height/2);

    vis.removeLabels('.party-label-text');
    vis.removeLabels(".contribution-type-label");

};


BeeSwarm.prototype.separateSelfContributions = function() {
    const vis = this;

    vis.featuredContributionOffset = 105;
    vis.allOthersOffset = -15;

    vis.simulation
        // .alpha(0.2)
        .alpha(0.12)
        .alphaDecay(0.004)
        .force('y', d3.forceY( d => {
            let yPosition = vis.officeTypeCoordinates(d.race_type)[1];

            if (d.contribution_source === "self_contributions") {
                yPosition += vis.featuredContributionOffset;
            }
            else {
                yPosition += vis.allOthersOffset;
            }

            return yPosition;
        }).strength(0.9))
        // .restart();

    vis.removeLabels(".contribution-type-label");

    vis.selfContributionLabel = vis.svg.selectAll("#self-contribution-label")
        .data([{'offset': 0}, {'offset': 0.25*vis.height}, {'offset': 0.5*vis.height}])
        .join("text")
        .attr("id", "self-contribution-label")
        .attr("class", "contribution-type-label")
        .attr("x", vis.width*0.957)
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1] + vis.featuredContributionOffset)
        .style("font-size", "12px")
        .style("text-anchor", "start")
        .text("Self-Contributions");

    vis.allOtherContributionLabel = vis.svg.selectAll("#other-contribution-label")
        .data([{'offset': 0}, {'offset': 0.25*vis.height}, {'offset': 0.5*vis.height}])
        .join("text")
        .attr("id", "other-contribution-label")
        .attr("class", "contribution-type-label")
        .attr("x", vis.width*0.957)
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1] + vis.allOthersOffset)
        .style("font-size", "12px")
        .style("text-anchor", "start")
        .text("All Other Sources");

    vis.individualContributionLabel = vis.svg.selectAll("#individual-contribution-label")
        .data([{'offset': 0}, {'offset': 0.25*vis.height}, {'offset': 0.5*vis.height}])
        .join("text")
        .attr("id", "individual-contribution-label")
        .attr("class", "contribution-type-label")
        .attr("x", vis.width*0.957)
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1] - 18)
        .style("font-size", "12px")
        .style("text-anchor", "start")
        .attr("dy", "1.25em")
        .attr("opacity", 0.0)
        .text("");

    vis.largeContributionLabel = vis.svg.selectAll("#large-contribution-label")
        .data([{'offset': 0}, {'offset': 0.24*vis.height}, {'offset': 0.47*vis.height}])
        .join("text")
        .attr("id", "large-contribution-label")
        .attr("class", "contribution-type-label")
        .attr("x", (d,i) => i === 2 ? 0.9*vis.width + -40 : 0.9*vis.width + -30)
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1] - 45)
        .style("font-size", "12px")
        .style("text-anchor", "middle")
        .text("");

    vis.smallContributionLabel = vis.svg.selectAll("#small-contribution-label")
        .data([{'offset': 0}, {'offset': 0.24*vis.height}, {'offset': 0.47*vis.height}])
        .join("text")
        .attr("id", "small-contribution-label")
        .attr("class", "contribution-type-label")
        .attr("x", (d,i) => i === 2 ? 0.9*vis.width + 40 : 0.9*vis.width + 30)
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1] - 45)
        .style("font-size", "12px")
        .style("text-anchor", "middle")
        .text("");


    vis.superPACContributionLabel = vis.svg.selectAll("#super-pac-contribution-label")
        .data([{'offset': 0}])
        .join("text")
        .attr("id", "super-pac-contribution-label")
        .attr("class", "contribution-type-label")
        .attr("x", vis.width*0.957)
        .attr("y", vis.officeTypeCoordinates("president")[1] + 195)
        .style("font-size", "12px")
        .style("text-anchor", "start")
        .text("");


    if (scrollDirection === "up") {
        vis.beeswarm
            .transition()
            .duration(0.6 * vis.beeswarmTransitionTime)
                .attr("opacity", 1.0)
                .attr("cx", d => d.candidate_x)
                .attr("cy", d => d.candidate_y)
            .transition()
            .duration(0.6 *vis.beeswarmTransitionTime)
            .attr("opacity", 1.0)
                .attr("cx", d => d.selfDonation_x)
                .attr("cy", d => d.selfDonation_y)
    }
    else {
        vis.beeswarm
            .transition()
            .duration(vis.beeswarmTransitionTime)
            .attr("opacity", 1.0)
            .attr("cx", d => d.selfDonation_x)
            .attr("cy", d => d.selfDonation_y)
        // .attr("opacity", d => d.contribution_source === "self_contributions" ? 1.0 : 0.5)
    }
};


BeeSwarm.prototype.separateSelfContributionParty = function() {
    const vis = this;

    // vis.simulation
    //     .stop()
    //     .alpha(0.15)
    //     .alphaDecay(0.004)
    //     .force('x', d3.forceX( d => {
    //         if (d.race_type === "president") {
    //             return vis.presidentXScale(d.fec_id)*vis.width;
    //         }
    //         else if (d.race_type === "senate") {
    //             let xPos = vis.senateXScale(d.fec_id)*vis.width;
    //             if (vis.senateXScale(d.fec_id) === 0.9 && d.contribution_source === "self_contributions") {
    //                 if (d.party === "REP") {
    //                     xPos += 35
    //                    }
    //                 else {
    //                     xPos -= 35;
    //                 }
    //             }
    //             return xPos;
    //         }
    //         else {
    //             let xPos = vis.houseXScale(d.fec_id)*vis.width;
    //             if (vis.senateXScale(d.fec_id) === 0.9  && d.contribution_source === "self_contributions") {
    //                 if (d.party === "REP") {
    //                     xPos += 35;
    //                    }
    //                 else {
    //                     xPos -= 35;
    //                 }
    //             }
    //             return xPos;
    //         }
    //         }).strength(0.9))
    //     .restart();
    vis.beeswarm
        .transition()
        .duration(vis.beeswarmTransitionTime)
            .attr("opacity", 1.0)
            .attr("cx", d => (d.race_type !== "president"
                && vis.senateXScale(d.fec_id) === 0.9
                && vis.houseXScale(d.fec_id) === 0.9
                && d.contribution_source === "self_contributions") ?
                d.selfDonationParty_x : d.selfDonation_x)
            .attr("cy", d => (d.race_type !== "president"
                && vis.senateXScale(d.fec_id) === 0.9
                && vis.houseXScale(d.fec_id) === 0.9
                && d.contribution_source === "self_contributions") ?
                d.selfDonationParty_y : d.selfDonation_y)
};


BeeSwarm.prototype.separateTransfersOther = function() {
    const vis = this;

    vis.simulation
        // .stop()
        .alpha(0.15)
        .alphaDecay(0.004)
        .force('y', d3.forceY( d => {
            let yPosition = vis.officeTypeCoordinates(d.race_type)[1];

            if (d.contribution_source === "transfers") {
                yPosition += vis.featuredContributionOffset;
            }
            else {
                yPosition -= 5;
            }

            if (d.first_name === "MICHAEL" && d.last_name === "BLOOMBERG") {
                yPosition += 15;
            }

            return yPosition;
            // let yPosition = vis.officeTypeCoordinates(d.race_type)[1];
            //
            // if (d.contribution_source === "self_contributions") {
            //     if (d.first_name === 'MICHAEL' && d.last_name === 'BLOOMBERG') {
            //         yPosition += 116;
            //     }
            //     else if (d.race_type === 'house') {
            //         yPosition += 125;
            //     }
            //     else {
            //         yPosition += 110;
            //     }
            // }
            // else if (d.contribution_source === 'transfers' || d.contribution_source === 'other') {
            //     if ((d.first_name === 'MICHAEL' && d.last_name === 'BLOOMBERG') || d.last_name === 'STEYER')  {
            //         yPosition += 16
            //     }
            //     else if (d.race_type === 'president') {
            //         yPosition += 28;
            //     }
            //     else if (d.race_type === 'senate') {
            //         yPosition += 55
            //     }
            //     else {
            //         yPosition += 65
            //     }
            // }
            // else if(d.race_type === 'president') {
            //     yPosition -= 40;
            // }
            // else {
            //     yPosition -= 20;
            // }
            //
            // return yPosition;
        }).strength(0.9))
        // .restart();

    vis.selfContributionLabel
        .transition()
        .duration(vis.beeswarmTransitionTime)
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1] + 105)
        .text("Transfers");

    vis.allOtherContributionLabel
        .transition()
        .duration(vis.beeswarmTransitionTime)
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1])
        .text("All Other Sources");

    vis.individualContributionLabel
        // .attr("y", vis.officeTypeCoordinates("president")[1] - 55)
        .text("");
        // .call(wrap, vis.width*0.07);

    vis.largeContributionLabel
        .text("");

    vis.smallContributionLabel
        .text("");

    vis.beeswarm
        .transition()
        .duration(0.6*vis.beeswarmTransitionTime)
        .attr("opacity", 1.0)
            .attr("cx", d => d.candidate_x)
            .attr("cy", d => d.candidate_y)
        .transition()
        .delay(300)
        .duration(0.6*vis.beeswarmTransitionTime)
            .attr("cx", d => d.transfersOnly_x)
            .attr("cy", d => d.transfersOnly_y)
        // .attr("opacity", d => (d.contribution_source === "transfers" || d.contribution_source === "other") ? 1.0 : 0.5)
};


BeeSwarm.prototype.separateIndividualDonations = function() {
    const vis = this;

    // vis.simulation
    //     // .stop()
    //     .alpha(0.15)
    //     .alphaDecay(0.004)
    //     .force('y', d3.forceY( d => {
    //         let yPosition = vis.officeTypeCoordinates(d.race_type)[1];
    //
    //         if (d.contribution_source === "large_donor_contributions" ||
    //             d.contribution_source === "small_donor_contributions") {
    //             yPosition += -5;
    //         }
    //         else {
    //             yPosition += vis.featuredContributionOffset;
    //         }
    //
    //         return yPosition;
    //     }).strength(0.9))
    //     .restart();

    vis.selfContributionLabel
        .transition()
        .duration(vis.beeswarmTransitionTime)
        .text("");
        // .attr("y", vis.officeTypeCoordinates("president")[1] + 110);

    vis.allOtherContributionLabel
        .transition()
        .duration(vis.beeswarmTransitionTime)
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1] + 105);
        // .text("Transfers");

    vis.individualContributionLabel
        .text("Individual Contributions")
        .call(wrap, vis.width*0.07);

    vis.individualContributionLabel
        .attr("y", d => d.offset + vis.officeTypeCoordinates("president")[1] - 18)
        .transition()
        .duration(vis.beeswarmTransitionTime)
        // .text("Individual Contributions")
        .attr("opacity", 1.0);
        // .on("end", wrap);

    vis.largeContributionLabel
        .text("");

    vis.smallContributionLabel
        .text("");

    vis.beeswarm
        .transition()
        .duration(0.6*vis.beeswarmTransitionTime)
        .attr("opacity", 1.0)
            .attr("cx", d => d.candidate_x)
            .attr("cy", d => d.candidate_y)
        .transition()
        .delay(250)
        .duration(0.6*vis.beeswarmTransitionTime)
        .attr("opacity", 1.0)
            .attr("cx", d => d.individualDonationOnly_x)
            .attr("cy", d => d.individualDonationOnly_y)
        // .attr("opacity", d => (d.contribution_source === "transfers" || d.contribution_source === "other") ? 1.0 : 0.5)

};


BeeSwarm.prototype.separateIndividualDonationTypes = function() {
    const vis = this;

    vis.simulation
        // .alpha(0.3)
        .alpha(0.14)
        .alphaDecay(0.004)
        // .force('force', d3.forceManyBody().strength(-2))
                .force('y', d3.forceY( d => {
            let yPosition = vis.officeTypeCoordinates(d.race_type)[1];

            if (d.contribution_source === "large_donor_contributions" ||
                d.contribution_source === "small_donor_contributions") {
                yPosition += -5;
            }
            else {
                yPosition += vis.featuredContributionOffset;
            }

            return yPosition;
        }).strength(0.9))
        .force('x', d3.forceX( d => {
            let xPosition = null;

            if (d.race_type === "president") {
                xPosition = vis.presidentXScale(d.fec_id)*vis.width;
            }
            else if (d.race_type === "senate") {
                xPosition = vis.senateXScale(d.fec_id)*vis.width;
            }
            else {
                xPosition = vis.houseXScale(d.fec_id)*vis.width;
            }

            if (d.contribution_source === "small_donor_contributions") {
                if (xPosition / vis.width === 0.9) {
                    if (d.race_type === 'president') {
                        xPosition += 32
                    }
                    else if (d.race_type === 'senate') {
                        xPosition += 32
                    }
                    else {
                        xPosition += 40
                    }
                }
                else {
                    if (d.race_type === "president") {
                        xPosition += 32
                    }
                    else {
                        xPosition += 25
                    }
                }
            }
            else if (d.contribution_source === "large_donor_contributions") {
                if (xPosition / vis.width === 0.9) {
                    if (d.race_type === 'president') {
                        xPosition -= 32
                    }
                    else if (d.race_type === 'senate') {
                        xPosition -= 32
                    }
                    else {
                        xPosition -= 40
                    }
                }
                else {
                    if (d.race_type === "president") {
                        xPosition -= 32
                    }
                    else {
                        xPosition -= 25
                    }
                }
            }

            if (d.contribution_source !== "small_donor_contributions" && d.contribution_source !== "large_donor_contributions" && d.contribution_source !== 'transfers' &&
            d.contribution_source !== "other" && d.contribution_source !== "self_contributions") {
                console.log(d.contribution_source, d)
            }

            return xPosition;
            // vis.officeTypeCoordinates(d.office_type)[0]
        }).strength(0.9))
        // .restart();


    vis.largeContributionLabel
        .text("$200+");

    vis.smallContributionLabel
        .text("<$200");


    vis.individualContributionLabel
        .text("Individual Contributions")
        .call(wrap, vis.width*0.07);

    vis.allOtherContributionLabel
        .text("All Other Sources");


    vis.beeswarm
        .transition("re-entrance")
        .duration(vis.beeswarmTransitionTime)
            .attr("cx", d => d.indivDonationSplitOnly_x)
            .attr("cy", d => d.indivDonationSplitOnly_y)
            .attr("opacity", 1.0)
            .attr("r", 2.5);
        // .attr("opacity", d => (d.contribution_source === "small_donor_contributions" || d.contribution_source === "large_donor_contributions") ? 1.0 : 0.5)


    vis.officeTypeLabels
        .transition()
        .duration(300)
        .attr("opacity", 1.0);

    vis.candidateLabels
        .transition()
        .duration(300)
        .attr("opacity", 1.0);

    vis.svg.select('#President-office-label')
        .text('President');

    vis.removeLabels('.super-pac-label');

};


BeeSwarm.prototype.hideCongressionalMoney = function() {
    const vis = this;

    vis.beeswarm
        .transition()
        .duration(800)
            .attr("opacity", 1.0)
            .attr("cx", d => {
                if (d.race_type === "president") {
                    return d.indivDonationSplitOnly_x;
                }
                else if (d.race_type === "senate") {
                    return vis.senateXScale(d.fec_id)*vis.width;
                }
                else {
                    return vis.houseXScale(d.fec_id)*vis.width;
                }
            })
            .attr("cy", d => d.race_type === "president" ? d.indivDonationSplitOnly_y : vis.officeTypeCoordinates(d.race_type)[1])
        .transition()
        .duration(50)
            .attr("r", d => d.race_type === "president" ? 2.5 : 0);


    vis.officeTypeLabels
        .transition()
        .duration(300)
        .attr("opacity", d => d === "President" ? 1.0 : 0.0);

    vis.candidateLabels
        .transition()
        .duration(300)
        .attr("opacity", d => (vis.presidentXScale(d.fec_id) !== 0.9 || d === "ALL OTHER CANDIDATES") ? 1.0 : 0.0);

    vis.individualContributionLabel
        .text(d => d.offset > 0 ? "" : "Individual Contributions")
        .call(wrap, vis.width*0.07);

    vis.allOtherContributionLabel
        .text(d => d.offset > 0 ? "" : "All Other Sources");

    vis.largeContributionLabel
        .text((d,i) => i > 0 ? "" : "$200+");

    vis.smallContributionLabel
        .text((d,i) => i > 0 ? "" : "<$200");


};


BeeSwarm.prototype.addSuperPACMoney = function () {
    const vis = this;

    vis.pacBlocks
        .transition()
        .delay(800)
        .duration(vis.beeswarmTransitionTime)
            .attr("r", 2.5)
            .attr("cx", d => d.superPacEntrance_x)
            .attr("cy", d => d.superPacEntrance_y);

    vis.pacTick = () => {
        tickCount += 1;

        vis.pacSimulation.tick();

		d3.selectAll('.pac-node')
			.attr('cx', d => d.x)
			.attr('cy', d => d.y)
	};

    vis.pacSimulation =
        d3.forceSimulation(superPACblocks)
            .force('x', d3.forceX( d => vis.partyCoordinates(d.party)[0]).strength(1.0))
            .force('y', d3.forceY( d => vis.height*.67).strength(1.0))
            .force('repel', d3.forceManyBody().strength(-20).distanceMax(4))
            .force('collide', d3.forceCollide(2.5).strength(0.8).iterations(8))
            // .alphaDecay(0.005)
            .alpha(0.12)
            .alphaDecay(0.004)
            .on('tick', vis.pacTick)
            .stop();


    vis.superPACLabel = vis.svg.selectAll('.super-pac-label')
        .data(['Super PACs/ Carey Committees'])
        .join('text')
        .attr('class', 'super-pac-label')
        .attr('y', vis.height*0.65)
        .attr('x', 0.1*vis.width)
        .attr("dy", "1.1em")
        .style('text-anchor', 'middle')
        .style('font-size', "24px")
        .text(d => d)
        .call(wrap, 240);


    vis.svg.select('#President-office-label')
        .text('Presidential Campaigns')
        .attr("dy", "1.1em")
        .call(wrap, 230);

    vis.superPACContributionLabel
        .text("");

};


BeeSwarm.prototype.allocateSuperPacMoney = function() {
    const vis = this;


    vis.pacSimulation
        .force('x', d3.forceX( d => {
            if (d.race_type === 'president') {
                return vis.width*vis.presidentXScale(d.fec_id);
            }
            else {
                return vis.partyCoordinates(d.party)[0];
            }
        }).strength(1.0))
        .force('y', d3.forceY( d => {
            if (d.race_type === 'president') {
                return vis.officeTypeCoordinates('president')[1] + 195;
            }
            else {
                return vis.height*.67;
            }
        }).strength(1.0))
        // .force('repel', d3.forceManyBody().strength(-20).distanceMax(4))
        .force('collide', d3.forceCollide(2.5).strength(0.8).iterations(3))
        // .alphaDecay(0.005)
        .alpha(0.12)
        .alphaDecay(0.004)
        .on('tick', vis.pacTick)
        // .stop();
        // .restart();

    vis.superPACContributionLabel
        .text("Super PACs");

    vis.pacBlocks
        .transition()
        .duration(vis.beeswarmTransitionTime)
            .attr("r", 2.5)
            .attr("cx", d => d.superPacAllocation_x)
            .attr("cy", d => d.superPacAllocation_y);
};


BeeSwarm.prototype.removeLabels = function(labelClass) {
    const vis = this;

    vis.svg.selectAll(labelClass).remove();
};


BeeSwarm.prototype.hideMap = function() {
    const vis = this;

    vis.removeLabels(".map-label");

    vis.usMap
        .transition()
        .duration(1000)
        .attr("opacity", 0);
        // .on('mouseover', null);

    d3.select(".beeswarm-state-tip").remove();

};


BeeSwarm.prototype.showMap = function() {
    const vis = this;


    vis.svg.append("text")
        .attr("class", "map-label")
        .attr("x", 0.9*vis.width)
        .attr("y", 0.35*vis.height)
        .style("font-size", "14px")
        .style("text-anchor", "middle")
        .text("Self-Contributions");

    vis.svg.append("text")
        .attr("class", "map-label")
        .attr("x", 0.9*vis.width)
        .attr("y", 0.65*vis.height)
        .style("font-size", "14px")
        .style("text-anchor", "middle")
        .text("Donor Unknown/Transfer");

    vis.usMap
        .transition()
        .duration(1000)
        .attr("opacity", 1);

    vis.initStateTooltip();
};


BeeSwarm.prototype.initStateTooltip = function() {
    const vis = this;

    d3.selectAll('.beeswarm-state-tip').remove();

    vis.tip = d3.tip()
        .attr("class", "d3-tip beeswarm-state-tip")
        .html(function(d) {
            let outputString = '<div>';
            outputString += `<div style="text-align: center;"><span><strong>${d.properties.NAME}</strong></span></div><br>`;

            outputString += '<table><tr>\n' +
                '    <td></td>\n' +
                '    <th scope="col">DEM</th>\n' +
                '    <th scope="col">REP</th>\n' +
                '    <th scope="col">OTHER</th>\n' +
                '  </tr>\n' +
                '  <tr>\n' +
                '    <th scope="row">President</th>\n' +
                `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.DEM.president)}</td>\n` +
                `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.REP.president)}</td>\n` +
                `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.OTH.president)}</td>\n` +
                '  </tr>\n' +
                '  <tr>\n' +
                '    <th scope="row">Senate</th>\n' +
                `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.DEM.senate)}</td>\n` +
                `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.REP.senate)}</td>\n` +
                `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.OTH.senate)}</td>\n` +
                '  </tr>' +
                '  <tr>\n' +
                    '    <th scope="row">House</th>\n' +
                    `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.DEM.house)}</td>\n` +
                    `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.REP.house)}</td>\n` +
                    `    <td>${d3.format("$,.0f")(d.properties.contributionCounts.OTH.house)}</td>\n` +
                    '  </tr></table>'

            // outputString += `<span>Democratic Money:</span> <span style="float: right;">${d3.format("$,.0f")(d.properties.contributionCounts.DEM.president)}</span><br>`;

            outputString += '</div>';

            return outputString
        });

    vis.svg.call(vis.tip);
};


function summarizeContributionCounts(trueCounts) {

    let contributionCounts = {};

    contributionCounts['DEM'] = {'president': 0, 'house': 0, 'senate': 0};
        contributionCounts['REP'] = {'president': 0, 'house': 0, 'senate': 0};
        contributionCounts['OTH'] = {'president': 0, 'house': 0, 'senate': 0};

        Object.keys(trueCounts).forEach(party => {
            let partyGroup = (party === 'DEM' || party === 'DFL') ? 'DEM' : (party === 'REP') ? 'REP' : 'OTH';

            Object.keys(trueCounts[party]).forEach(office => {
                contributionCounts[partyGroup][office] += trueCounts[party][office]
            })
        });

    return contributionCounts;
}